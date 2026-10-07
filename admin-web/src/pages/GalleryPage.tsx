import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { EmptyState, ErrorState, LoadingState, PageHeader, Panel, StatusBadge } from '../components/ui';
import { deleteGalleryItem, deleteGalleryStoragePath, listGallery, saveGalleryItem, uploadGalleryImage } from '../services/admin-service';
import type { GalleryRow } from '../types';

const EMPTY = {
  title_es: '', title_en: '', description_es: '', description_en: '',
  sort_order: 0, is_active: true,
};

export function GalleryPage() {
  const [rows, setRows] = useState<GalleryRow[]>([]);
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [editing, setEditing] = useState<GalleryRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    setState('loading');
    try { setRows(await listGallery()); setState('success'); }
    catch { setState('error'); }
  }, []);
  useEffect(() => {
    let current = true;
    void listGallery().then((items) => { if (current) { setRows(items); setState('success'); } }).catch(() => { if (current) setState('error'); });
    return () => { current = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('image');
    let uploadedPath: string | null = null;
    try {
      let storagePath = editing?.storage_path ?? '';
      if (file instanceof File && file.size > 0) {
        uploadedPath = await uploadGalleryImage(file);
        storagePath = uploadedPath;
      }
      if (!storagePath) throw new Error('Seleccione una fotografía.');
      await saveGalleryItem({
        id: editing?.id, storage_path: storagePath,
        title_es: String(form.get('title_es') ?? '').trim() || null,
        title_en: String(form.get('title_en') ?? '').trim() || null,
        description_es: String(form.get('description_es') ?? '').trim() || null,
        description_en: String(form.get('description_en') ?? '').trim() || null,
        sort_order: Number(form.get('sort_order') ?? 0),
        is_active: form.get('is_active') === 'on',
      });
      if (uploadedPath && editing?.storage_path && editing.storage_path !== uploadedPath) {
        await deleteGalleryStoragePath(editing.storage_path).catch(() => undefined);
      }
      setMessage('La galería se actualizó correctamente.');
      setEditing(null); setCreating(false); await load();
    } catch (error) {
      if (uploadedPath && uploadedPath !== editing?.storage_path) {
        await deleteGalleryStoragePath(uploadedPath).catch(() => undefined);
      }
      setMessage(error instanceof Error ? `No fue posible guardar la fotografía. ${error.message}` : 'No fue posible guardar la fotografía.');
    }
  }

  async function remove(row: GalleryRow) {
    if (!window.confirm(`¿Eliminar definitivamente “${row.title_es ?? 'esta fotografía'}”?`)) return;
    try { await deleteGalleryItem(row); setMessage('Fotografía eliminada.'); await load(); }
    catch { setMessage('No fue posible eliminar la fotografía.'); }
  }

  const formDefaults = editing ?? EMPTY;
  return <>
    <PageHeader eyebrow="Administración" title="Galería">
      <button type="button" className="primary-action" onClick={() => { setEditing(null); setCreating(true); }}>Subir fotografía</button>
    </PageHeader>
    <p className="page-intro">Las fotografías activas aparecen automáticamente en la PWA, ordenadas por prioridad.</p>
    {message && <div className={message.startsWith('No') ? 'alert error' : 'alert success'} role="status">{message}</div>}
    {(creating || editing) && <Panel title={editing ? 'Editar fotografía' : 'Nueva fotografía'}>
      <form className="gallery-form" onSubmit={save}>
        <label>Fotografía JPG, PNG o WebP (máximo 5 MB)<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required={!editing}/></label>
        <div className="form-grid">
          <label>Título en español<input name="title_es" defaultValue={formDefaults.title_es ?? ''} maxLength={140}/></label>
          <label>Título en inglés<input name="title_en" defaultValue={formDefaults.title_en ?? ''} maxLength={140}/></label>
          <label>Descripción en español<textarea name="description_es" defaultValue={formDefaults.description_es ?? ''} maxLength={800}/></label>
          <label>Descripción en inglés<textarea name="description_en" defaultValue={formDefaults.description_en ?? ''} maxLength={800}/></label>
          <label>Orden<input name="sort_order" type="number" min="0" defaultValue={formDefaults.sort_order}/></label>
          <label className="check-row"><input name="is_active" type="checkbox" defaultChecked={formDefaults.is_active}/> Fotografía activa</label>
        </div>
        <div className="form-actions"><button type="button" className="secondary" onClick={() => { setEditing(null); setCreating(false); }}>Cancelar</button><button type="submit">Guardar</button></div>
      </form>
    </Panel>}
    <Panel>{state === 'loading' ? <LoadingState rows={4}/> : state === 'error' ? <ErrorState retry={() => void load()}/> : rows.length === 0 ? <EmptyState title="Galería vacía" detail="Suba la primera fotografía para publicarla en la PWA."/> : <div className="gallery-admin-grid">{rows.map((row) => <article key={row.id} className="gallery-admin-card">
      {row.signed_url && <img src={row.signed_url} alt={row.title_es ?? 'Fotografía de la ruta'}/>}<div><StatusBadge value={row.is_active ? 'published' : 'inactive_access'}/><h3>{row.title_es || 'Sin título'}</h3><p>{row.description_es || 'Sin descripción'}</p><small>Orden: {row.sort_order}</small><div className="row-actions"><button type="button" className="table-action" onClick={() => { setCreating(false); setEditing(row); }}>Editar</button><button type="button" className="danger-link" onClick={() => void remove(row)}>Eliminar</button></div></div>
    </article>)}</div>}</Panel>
  </>;
}
