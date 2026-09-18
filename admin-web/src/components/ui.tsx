import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return <header className="page-header">
    <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1></div>
    {children && <div className="header-actions">{children}</div>}
  </header>
}

export function Panel({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{title && <h2>{title}</h2>}{children}</section>
}

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return <div className="skeleton-stack" aria-label="Cargando">
    {Array.from({ length: rows }, (_, index) => <div className="skeleton" key={index} />)}
  </div>
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><span>○</span><h3>{title}</h3><p>{detail}</p></div>
}

export function ErrorState({ retry }: { retry?: () => void }) {
  return <div className="empty-state error-state"><span>!</span><h3>No fue posible cargar la información</h3><p>Intente nuevamente. No se realizó ningún cambio.</p>{retry && <button type="button" className="secondary" onClick={retry}>Reintentar</button>}</div>
}

const statusLabels: Record<string, string> = {
  forming: 'Programado', in_progress: 'En curso', completed: 'Finalizado', cancelled: 'Cancelado',
  active: 'En recorrido', returning_early: 'Retorno anticipado', returned_early: 'Retornó antes',
  withdrawn_before_start: 'Retirado antes', overdue: 'Hora estimada superada', due_soon: 'Próximo a retornar',
  on_route: 'En recorrido', early_return: 'Retorno anticipado', early_return_completed: 'Retorno confirmado',
  active_access: 'Activo', inactive_access: 'Desactivado',
}

export function StatusBadge({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{statusLabels[value] ?? value}</span>
}

export function Avatar({ name, preset, path }: { name: string; preset?: string | null; path?: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  useEffect(() => {
    if (!path) return
    let current = true
    void supabase.storage.from('avatars').createSignedUrl(path, 300).then(({ data }) => {
      if (current) setUrl(data?.signedUrl ?? null)
    })
    return () => { current = false }
  }, [path])
  return <span className={`avatar avatar-${preset ?? 'mint'}`} aria-hidden="true">{url ? <img src={url} alt=""/> : initials || 'V'}</span>
}

export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    visitors: <><circle cx="9" cy="8" r="4"/><path d="M2.5 21v-2a6.5 6.5 0 0 1 13 0v2M16 4.5a4 4 0 0 1 0 7.5M18 15a5 5 0 0 1 3.5 4.8V21"/></>,
    ascent: <path d="m3 20 7-12 3 5 2-3 6 10H3Zm4-4 3-2 2 2 3-2 3 2"/>,
    returns: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    staff: <><circle cx="9" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M17 11l2 2 3-4"/></>,
    permissions: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h5M8 16h3"/></>,
    audit: <><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5"/><path d="m3 9 2 2 5-6M9 15h8M9 18h6"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/></>,
  }
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}
