// CLI 2.117.0 does not expose GoTrue's current-password flag in config.toml.
// Configure the official Auth setting through the local Docker Engine API.
// No custom password verification, image edits, secret files or remote access.
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const name = 'supabase_auth_volcan-santa-maria-pwa';
const flag = 'GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD';
const host = execFileSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
if (!host.startsWith('npipe://') && !host.startsWith('unix://')) throw new Error('A local Docker socket is required');
const socketPath = host.startsWith('npipe://') ? host.slice(8).replaceAll('/', '\\') : host.slice(7);
function docker(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const request = http.request({ socketPath, method, path: `/v1.45${path}`, headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} }, response => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        if (response.statusCode >= 300) return reject(new Error(`Local Docker operation failed (HTTP ${response.statusCode})`));
        resolve(data ? JSON.parse(data) : null);
      });
    });
    request.on('error', () => reject(new Error('Local Docker transport failed')));
    request.end(payload);
  });
}

try {
  const current = await docker('GET', `/containers/${name}/json`);
  if (!current.Config.Image.endsWith('/gotrue:v2.196.0') || current.Mounts.length !== 0) {
    throw new Error('Expected the reviewed stateless local Auth v2.196.0 container');
  }
  if (current.Config.Env.includes(`${flag}=true`)) {
    console.log('Local Auth current-password enforcement: enabled');
  } else {
    if (process.argv.includes('--check')) throw new Error('Local Auth current-password enforcement is missing; run npm run auth:local:start');
    const network = Object.keys(current.NetworkSettings.Networks);
    if (network.length !== 1 || network[0] !== 'supabase_network_volcan-santa-maria-pwa') throw new Error('Unexpected Auth network');
    const original = {
      ...current.Config, Hostname: '',
      HostConfig: current.HostConfig,
      NetworkingConfig: { EndpointsConfig: { [network[0]]: { Aliases: [name] } } },
    };
    const secured = { ...original, Env: [...original.Env.filter(value => !value.startsWith(`${flag}=`)), `${flag}=true`] };
    // Only stateless Auth is recreated. PostgreSQL and its volumes are untouched.
    await docker('POST', `/containers/${name}/stop?t=10`);
    await docker('DELETE', `/containers/${name}`);
    let replacementCreated = false;
    try {
      await docker('POST', `/containers/create?name=${name}`, secured);
      replacementCreated = true;
      await docker('POST', `/containers/${name}/start`);
      let healthy = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        const status = await docker('GET', `/containers/${name}/json`);
        if (status.State.Health?.Status === 'healthy') { healthy = true; break; }
        if (!status.State.Running) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      if (!healthy) throw new Error('Configured Auth did not become healthy');
      console.log('Local Auth current-password enforcement: enabled and healthy');
    } catch {
      if (replacementCreated) await docker('DELETE', `/containers/${name}?force=true`);
      await docker('POST', `/containers/create?name=${name}`, original);
      await docker('POST', `/containers/${name}/start`);
      throw new Error('Auth configuration failed; previous stateless container restored');
    }
  }
} catch (error) {
  // Docker payloads contain credentials. Never print response bodies or config.
  console.error(error.message);
  process.exitCode = 1;
}
