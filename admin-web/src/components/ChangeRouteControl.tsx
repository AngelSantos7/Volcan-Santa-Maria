import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function ChangeRouteControl({ visitId, routeId, started, onChanged }: { visitId: string; routeId: string; started: boolean; onChanged: () => void }) {
  const [routes, setRoutes] = useState<Array<{ id: string; name_es: string }>>([]);
  const [selected, setSelected] = useState(routeId);
  const [stage, setStage] = useState<'select' | 'warning' | 'confirm'>('select');
  const [returned, setReturned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void supabase.from('routes').select('id,name_es').eq('is_active', true).then(({ data, error }) => {
      if (active) { setRoutes(data ?? []); if (error) setError('No fue posible cargar las rutas.'); }
    });
    return () => { active = false; };
  }, []);
  async function save() {
    setBusy(true); setError('');
    try {
      const { error } = await supabase.rpc('change_visit_route', { p_visit_id: visitId, p_route_id: selected, p_returned_to_start: started && returned });
      if (error) throw error;
      setStage('select'); setReturned(false); onChanged();
    } catch { setError('No fue posible cambiar la ruta. Verifique el estado del ascenso y sus permisos.'); }
    finally { setBusy(false); }
  }
  return <div className="route-change-control">
    <label>Ruta<select value={selected} onChange={(event) => { setSelected(event.target.value); setStage('select'); setReturned(false); }} disabled={busy}>
      {routes.map((route) => <option key={route.id} value={route.id}>{route.name_es}</option>)}
    </select></label>
    {error && <p role="alert">{error}</p>}
    {stage === 'warning' && <p>No existe una ruta directa entre el Mirador Picacho y la Cima del Volcán Santa María. Para cambiar de ruta debe regresar primero al punto de inicio y comenzar desde allí. No intente conectar ambas rutas fuera de los senderos mostrados.</p>}
    {stage === 'confirm' && <><p>¿Desea cambiar a Ruta {routes.find((route) => route.id === selected)?.name_es}?</p>
      {started && <label><input type="checkbox" checked={returned} disabled={busy} onChange={(event) => setReturned(event.target.checked)} />Confirmo que he regresado al punto de inicio y deseo comenzar la nueva ruta.</label>}</>}
    <button type="button" disabled={busy || selected === routeId || (stage === 'confirm' && started && !returned)} onClick={() => stage === 'confirm' ? void save() : setStage(stage === 'select' && started ? 'warning' : 'confirm')}>{stage === 'warning' ? 'Entendido' : 'Cambiar ruta'}</button>
    {stage !== 'select' && <button type="button" className="secondary" disabled={busy} onClick={() => { setSelected(routeId); setStage('select'); setReturned(false); }}>Cancelar</button>}
  </div>;
}
