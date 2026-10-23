import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RouteSelector } from './RouteSelector';
import { changeVisitRoute } from '../visits/visit-service';
import { getVisitErrorMessage } from '../visits/visit-errors';

export function ChangeRouteDialog({ visitId, routeId, started, onClose, onChanged }: {
  visitId: string; routeId: string; started: boolean; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(routeId);
  const [stage, setStage] = useState<'select' | 'warning' | 'confirm'>('select');
  const [returned, setReturned] = useState(false);
  const [targetSlug, setTargetSlug] = useState('');
  const target = t(targetSlug === 'mirador-picacho' ? 'final.picachoBadge' : 'final.summitBadge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try { await changeVisitRoute(visitId, selected, started && returned); await onChanged(); onClose(); }
    catch (reason) { setError(getVisitErrorMessage(reason)); setBusy(false); }
  }
  return <div className="legal-dialog-backdrop"><section className="legal-dialog" role="dialog" aria-modal="true" aria-label={t('final.changeRoute')}>
    <h2>{t('final.changeRoute')}</h2>
    {stage === 'select' ? <RouteSelector value={selected} onChange={(id, route) => { setSelected(id); setTargetSlug(route.slug); }} disabled={busy} /> :
      stage === 'warning' ? <p>{t('final.noConnection', { route: target })}</p> : <>
        <p>{t('final.targetRoute', { route: target })}</p>
        {started && <label className="terms-row"><input type="checkbox" checked={returned} onChange={(e) => setReturned(e.target.checked)} disabled={busy} /><span>{t('final.returnToStart')}</span></label>}
      </>}
    {error && <p role="alert">{error}</p>}
    <div className="form-actions">
      <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{t('common.cancel')}</button>
      <button type="button" className="primary-button" disabled={busy || !selected || selected === routeId || (stage === 'confirm' && started && !returned)} onClick={() => stage === 'confirm' ? void save() : setStage(stage === 'select' && started ? 'warning' : 'confirm')}>{t(stage === 'warning' ? 'final.understood' : 'final.changeRoute')}</button>
    </div>
  </section></div>;
}
