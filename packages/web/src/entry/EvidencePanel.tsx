// Evidence capture below a data element (spec §16.3). Captures queue into the
// mediaFiles store + pendingUploads outbox and sync via the two-step push.
// Utilitarian styling per docs/design-language.md — text labels, no emojis.
import { uuidv7, type EvidenceRequirement } from '@dodo/shared';
import { getDb } from '../db/db';
import { scheduleSync } from '../sync/engine';
import { Button } from '../components';

export interface MediaLite {
  id: string;
  evidenceType: string;
  syncStatus: string;
  fileName: string | null;
}

const ACCEPT: Record<string, string | undefined> = {
  photo: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  document: undefined,
  signature: 'image/*',
};

const ADD_LABEL: Record<string, string> = {
  photo: '+ photo',
  video: '+ video',
  audio: '+ audio',
  document: '+ file',
  signature: '+ signature',
};

export function EvidencePanel({
  dataElementId,
  programId,
  submissionId,
  requirements,
  media,
}: {
  dataElementId: string;
  programId: string | null;
  submissionId: string | null;
  requirements: EvidenceRequirement[];
  media: MediaLite[];
}) {
  async function captureFile(req: EvidenceRequirement, file: File) {
    if (!programId) return;
    const db = getDb();
    const id = uuidv7();
    const fileSizeKb = Math.max(1, Math.ceil(file.size / 1024));
    const now = new Date().toISOString();
    await db.mediaFiles.put({
      id,
      programId,
      dataElementId,
      submissionId,
      dataValueId: null,
      evidenceType: req.evidenceType,
      fileRef: null,
      fileName: file.name,
      fileSizeKb,
      mimeType: file.type,
      thumbnailRef: null,
      geoLat: null,
      geoLng: null,
      geoAccuracyM: null,
      deviceMeta: {},
      syncStatus: 'pending',
      localBlobKey: 1,
      capturedAt: now,
      createdAt: now,
    });
    await db.pendingUploads.add({
      mediaFileId: id,
      blob: file,
      fileName: file.name,
      mimeType: file.type,
      fileSizeKb,
      state: 'pending',
      tries: 0,
      createdAt: now,
    });
    scheduleSync();
  }

  function captureGps() {
    if (!programId || !('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const db = getDb();
        const id = uuidv7();
        const now = new Date().toISOString();
        await db.mediaFiles.put({
          id,
          programId,
          dataElementId,
          submissionId,
          dataValueId: null,
          evidenceType: 'gps',
          fileRef: null,
          fileName: null,
          fileSizeKb: null,
          mimeType: null,
          thumbnailRef: null,
          geoLat: pos.coords.latitude,
          geoLng: pos.coords.longitude,
          geoAccuracyM: pos.coords.accuracy,
          deviceMeta: {},
          syncStatus: 'pending',
          localBlobKey: null,
          capturedAt: now,
          createdAt: now,
        });
        scheduleSync();
      },
      () => {
        /* user denied or unavailable — leave the requirement unmet */
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="mt-1 space-y-1 border-l-2 border-hairline pl-3 text-[12px]">
      {requirements.map((req) => {
        const items = media.filter((m) => m.evidenceType === req.evidenceType);
        const pending = items.filter((m) => m.syncStatus === 'pending').length;
        const missing = req.isRequired && items.length === 0;
        return (
          <div key={req.id} className="flex flex-wrap items-center gap-2 py-0.5">
            <span className="small-caps text-ink-muted">{req.evidenceType}</span>
            {req.isRequired ? <span className="text-offtrack">*</span> : null}
            {req.evidenceType === 'gps' ? (
              <Button size="sm" variant="ghost" onClick={captureGps}>
                + GPS
              </Button>
            ) : (
              <label className="cursor-pointer text-primary hover:underline">
                {ADD_LABEL[req.evidenceType] ?? '+ file'}
                <input
                  type="file"
                  className="hidden"
                  accept={ACCEPT[req.evidenceType]}
                  capture={req.evidenceType === 'photo' ? 'environment' : undefined}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void captureFile(req, f);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            <span className={missing ? 'text-offtrack' : 'text-ink-muted'}>
              {items.length > 0
                ? `${items.length} attached${pending ? ` (${pending} ◌ pending)` : ''}`
                : missing
                  ? 'required — none yet'
                  : 'none'}
            </span>
            {req.instructions ? (
              <span className="text-ink-faint">— {req.instructions}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
