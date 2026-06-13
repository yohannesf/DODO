// Review & Approve (spec §8.2, M6): queue of completed submissions awaiting
// the approval chain; approve/reject with comment; per-submission history.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  Input,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from '../components';
import { api } from '../api/client';
import { ErrorNote } from './configure/common';
import { Page } from './Page';

interface PendingApproval {
  submissionId: string;
  datasetName: string;
  orgUnitName: string;
  period: string;
  completedByName: string | null;
  completedAt: string | null;
  note: string;
  approvalLevels: number;
  approvedLevels: number;
}

interface ApprovalRecord {
  id: string;
  level: number;
  actor: string;
  status: 'approved' | 'rejected';
  comment: string;
  ts: string;
}

export function Review() {
  const qc = useQueryClient();
  const pending = useQuery({
    queryKey: ['approvals'],
    queryFn: () => api.get<PendingApproval[]>('/api/approvals'),
  });
  const [action, setAction] = useState<{
    submission: PendingApproval;
    kind: 'approve' | 'reject';
  } | null>(null);
  const [comment, setComment] = useState('');
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const actMutation = useMutation({
    mutationFn: ({ id, kind, note }: { id: string; kind: string; note: string }) =>
      api.post(`/api/approvals/${id}/${kind}`, { comment: note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['approvals'] });
      setAction(null);
      setComment('');
    },
  });

  const history = useQuery({
    queryKey: ['approvals', historyFor],
    queryFn: () => api.get<ApprovalRecord[]>(`/api/approvals/${historyFor}/history`),
    enabled: historyFor !== null,
  });

  return (
    <Page title="Review & Approve">
      {pending.data?.length === 0 ? (
        <p className="text-sm text-ink-muted" data-testid="review-empty">
          Nothing waiting for approval. Completed submissions from datasets that require
          approval queue here for your org unit scope.
        </p>
      ) : (
        <Table className="max-w-5xl">
          <THead>
            <Tr>
              <Th>Dataset</Th>
              <Th>Org unit</Th>
              <Th>Period</Th>
              <Th>Completed by</Th>
              <Th>Chain</Th>
              <Th>Note</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {pending.data?.map((p) => (
              <Tr key={p.submissionId} className="hover:bg-surface">
                <Td className="font-medium">{p.datasetName}</Td>
                <Td>{p.orgUnitName}</Td>
                <Td className="tnum">{p.period}</Td>
                <Td className="text-ink-muted">
                  {p.completedByName ?? '—'}
                  {p.completedAt
                    ? ` · ${new Date(p.completedAt).toLocaleDateString()}`
                    : ''}
                </Td>
                <Td>
                  <span className="small-caps tnum text-ink-muted">
                    ◌ level {p.approvedLevels + 1}/{p.approvalLevels}
                  </span>
                </Td>
                <Td className="text-ink-muted">{p.note}</Td>
                <Td className="text-right whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setHistoryFor(p.submissionId)}
                  >
                    History
                  </Button>{' '}
                  <Button
                    size="sm"
                    onClick={() => setAction({ submission: p, kind: 'reject' })}
                  >
                    Reject…
                  </Button>{' '}
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setAction({ submission: p, kind: 'approve' })}
                  >
                    Approve…
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <ErrorNote error={pending.error ?? actMutation.error} />

      <Dialog open={action !== null} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent
          title={
            action
              ? `${action.kind === 'approve' ? 'Approve' : 'Reject'} ${action.submission.datasetName} — ${action.submission.period}`
              : ''
          }
          description={
            action?.kind === 'approve'
              ? `level ${action.submission.approvedLevels + 1} of ${action.submission.approvalLevels}`
              : 'rejection ends the chain; the submission returns to the field team'
          }
        >
          <div className="mt-3 space-y-3">
            <Field label={action?.kind === 'reject' ? 'Reason (required)' : 'Comment'}>
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                autoFocus
              />
            </Field>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button>Cancel</Button>
              </DialogClose>
              <Button
                variant="primary"
                disabled={
                  actMutation.isPending || (action?.kind === 'reject' && !comment.trim())
                }
                onClick={() =>
                  action &&
                  actMutation.mutate({
                    id: action.submission.submissionId,
                    kind: action.kind,
                    note: comment,
                  })
                }
              >
                {action?.kind === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyFor !== null} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent title="Approval history">
          <ul className="mt-3 space-y-1 text-sm">
            {history.data?.length === 0 ? (
              <li className="text-ink-muted">no actions yet</li>
            ) : null}
            {history.data?.map((h) => (
              <li key={h.id} className="border-b border-hairline pb-1">
                <span
                  className={
                    h.status === 'approved'
                      ? 'small-caps text-ontrack'
                      : 'small-caps text-offtrack'
                  }
                >
                  {h.status === 'approved' ? '● approved' : '▲ rejected'}
                </span>{' '}
                level {h.level} · {new Date(h.ts).toLocaleString()}
                {h.comment ? (
                  <span className="text-ink-muted"> — {h.comment}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
