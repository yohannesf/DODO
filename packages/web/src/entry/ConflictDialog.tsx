// Conflict resolver (spec §8.4): side-by-side mine vs server with actor and
// time; keep mine / take server / edit. Resolving re-pushes with the new
// base version.
import { useState } from 'react';
import type { DataValueUpsertPayload } from '@dodo/shared';
import { Button, Dialog, DialogContent, Field, Input } from '../components';
import type { ConflictRow } from '../db/db';
import {
  resolveConflictEdit,
  resolveConflictKeepMine,
  resolveConflictTakeServer,
} from '../sync/engine';

export function ConflictDialog({
  conflict,
  onClose,
  cellLabel,
}: {
  conflict: ConflictRow | null;
  onClose: () => void;
  cellLabel?: string;
}) {
  const [edited, setEdited] = useState('');
  const local = conflict?.localPayload as DataValueUpsertPayload | undefined;

  return (
    <Dialog open={conflict !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Resolve conflict"
        description={
          cellLabel ?? 'This value was changed on the server while your edit was offline.'
        }
        className="w-[min(560px,calc(100vw-2rem))]"
      >
        {conflict && local ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-px border border-hairline bg-hairline">
              <div className="bg-surface p-3">
                <p className="small-caps mb-1 text-ink-muted">mine (this device)</p>
                <p className="tnum text-2xl font-semibold">{local.value}</p>
                <p className="mt-1 text-[12px] text-ink-muted">
                  entered {new Date(conflict.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="bg-surface p-3">
                <p className="small-caps mb-1 text-ink-muted">server</p>
                <p className="tnum text-2xl font-semibold">
                  {conflict.conflict.serverValue ?? '— deleted —'}
                </p>
                <p className="mt-1 text-[12px] text-ink-muted">
                  {conflict.conflict.serverActor
                    ? `by ${conflict.conflict.serverActor.slice(0, 8)}… `
                    : ''}
                  {conflict.conflict.serverTs
                    ? new Date(conflict.conflict.serverTs).toLocaleString()
                    : ''}
                </p>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Field label="Or enter a different value" className="grow">
                <Input
                  value={edited}
                  onChange={(e) => setEdited(e.target.value)}
                  className="tnum"
                />
              </Field>
              <Button
                disabled={!edited.trim()}
                onClick={() => {
                  void resolveConflictEdit(conflict, edited.trim()).then(onClose);
                }}
              >
                Use this
              </Button>
            </div>
            <div className="flex justify-end gap-2 border-t border-hairline pt-3">
              <Button
                onClick={() => void resolveConflictTakeServer(conflict).then(onClose)}
              >
                Take server
              </Button>
              <Button
                variant="primary"
                onClick={() => void resolveConflictKeepMine(conflict).then(onClose)}
              >
                Keep mine
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
