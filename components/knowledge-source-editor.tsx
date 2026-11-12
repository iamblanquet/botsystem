'use client';
import { useState } from 'react';
import { api, type KnowledgeSource } from '@/lib/types';
import { Modal } from './platform-ui';
import KnowledgeImportForm from './knowledge-import-form';

export default function KnowledgeSourceEditor({ source, close, onSaved }: { source: KnowledgeSource; close: () => void; onSaved: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  return <Modal title="Editar conocimiento" description={'Fuente: ' + source.name + ' · Revisa la vista previa antes de actualizar.'} wide close={() => { if (!busy) close(); }}>
    <KnowledgeImportForm key={source.id + source.revision} source={source} assistantId={source.assistant_id} onBusy={setBusy} close={close} save={async input => { await api('/sources/' + source.id, 'PATCH', input); await onSaved(); close(); }} />
  </Modal>;
}
