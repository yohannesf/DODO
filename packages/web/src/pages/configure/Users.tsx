import { useState } from 'react';
import {
  ORG_UNIT_SCOPES,
  PERMISSIONS,
  type Role,
  type User,
  type UserOrgUnit,
} from '@dodo/shared';
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  FieldGroup,
  Input,
  OrgUnitSelect,
  Select,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from '../../components';
import { useEntityList, useEntityMutations } from '../../api/metadata';
import { EmptyHint, ErrorNote, SectionTitle } from './common';

function UserForm({ user, onDone }: { user: User | null; onDone: () => void }) {
  const roles = useEntityList('roles');
  const orgUnits = useEntityList('orgUnits');
  const { create, update } = useEntityMutations('users');
  const [form, setForm] = useState({
    username: user?.username ?? '',
    displayName: user?.displayName ?? '',
    email: user?.email ?? '',
    password: '',
    disabled: user?.disabled ?? false,
  });
  const [roleIds, setRoleIds] = useState<string[]>(user?.roleIds ?? []);
  const [scopes, setScopes] = useState<UserOrgUnit[]>(user?.orgUnits ?? []);
  const mutation = user ? update : create;

  const toggleRole = (id: string) =>
    setRoleIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  function submit() {
    const input = {
      username: form.username,
      displayName: form.displayName,
      email: form.email || null,
      disabled: form.disabled,
      ...(form.password ? { password: form.password } : {}),
      roleIds,
      orgUnits: scopes,
    };
    const promise = user
      ? update.mutateAsync({ id: user.id, patch: input })
      : create.mutateAsync(input);
    void promise.then(onDone).catch(() => {});
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Username">
          <Input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            autoFocus={!user}
          />
        </Field>
        <Field label="Display name">
          <Input
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email">
          <Input
            type="email"
            value={form.email ?? ''}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label={user ? 'New password (leave blank to keep)' : 'Password'}>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
      </div>
      <FieldGroup label="Roles">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {roles.data?.map((r) => (
            <Checkbox
              key={r.id}
              label={r.name}
              checked={roleIds.includes(r.id)}
              onChange={() => toggleRole(r.id)}
            />
          ))}
        </div>
      </FieldGroup>
      <FieldGroup label="Org unit scope" hint="which subtree(s) this user works in">
        <div className="space-y-1">
          {scopes.map((s, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <OrgUnitSelect
                label="Scope org unit"
                className="flex-1"
                orgUnits={orgUnits.data ?? []}
                value={s.orgUnitId}
                onChange={(id) =>
                  setScopes((rows) =>
                    rows.map((r, i) => (i === idx ? { ...r, orgUnitId: id } : r)),
                  )
                }
              />
              <Select
                value={s.scope}
                className="w-36"
                onChange={(e) =>
                  setScopes((rows) =>
                    rows.map((r, i) =>
                      i === idx
                        ? { ...r, scope: e.target.value as UserOrgUnit['scope'] }
                        : r,
                    ),
                  )
                }
              >
                {ORG_UNIT_SCOPES.map((s2) => (
                  <option key={s2} value={s2}>
                    {s2.replace('_', ' ')}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setScopes((rows) => rows.filter((_, i) => i !== idx))}
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            disabled={!orgUnits.data?.length}
            onClick={() =>
              setScopes((rows) => [
                ...rows,
                { orgUnitId: orgUnits.data![0]!.id, scope: 'data_entry' },
              ])
            }
          >
            Add scope
          </Button>
        </div>
      </FieldGroup>
      <Checkbox
        label="Disabled"
        checked={form.disabled}
        onChange={(e) => setForm({ ...form, disabled: e.target.checked })}
      />
      <ErrorNote error={mutation.error} />
      <div className="flex justify-end gap-2 pt-1">
        <DialogClose asChild>
          <Button>Cancel</Button>
        </DialogClose>
        <Button variant="primary" onClick={submit} disabled={mutation.isPending}>
          {user ? 'Save' : 'Create user'}
        </Button>
      </div>
    </div>
  );
}

function RoleForm({ role, onDone }: { role: Role | null; onDone: () => void }) {
  const { create, update } = useEntityMutations('roles');
  const [name, setName] = useState(role?.name ?? '');
  const [code, setCode] = useState(role?.code ?? '');
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? []);
  const mutation = role ? update : create;

  const toggle = (p: string) =>
    setPermissions((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));

  function submit() {
    const input = { name, code, permissions };
    const promise = role
      ? update.mutateAsync({ id: role.id, patch: input })
      : create.mutateAsync(input);
    void promise.then(onDone).catch(() => {});
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Code">
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
      </div>
      <FieldGroup label="Permissions">
        <div className="grid grid-cols-2 gap-1">
          {PERMISSIONS.map((p) => (
            <Checkbox
              key={p}
              label={p}
              checked={permissions.includes(p)}
              onChange={() => toggle(p)}
            />
          ))}
        </div>
      </FieldGroup>
      <ErrorNote error={mutation.error} />
      <div className="flex justify-end gap-2 pt-1">
        <DialogClose asChild>
          <Button>Cancel</Button>
        </DialogClose>
        <Button variant="primary" onClick={submit} disabled={mutation.isPending}>
          {role ? 'Save' : 'Create role'}
        </Button>
      </div>
    </div>
  );
}

export function UsersPage() {
  const users = useEntityList('users');
  const roles = useEntityList('roles');
  const userMut = useEntityMutations('users');
  const [userDialog, setUserDialog] = useState<{ open: boolean; user: User | null }>({
    open: false,
    user: null,
  });
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; role: Role | null }>({
    open: false,
    role: null,
  });

  const roleName = (id: string) => roles.data?.find((r) => r.id === id)?.name ?? '…';

  return (
    <section className="max-w-4xl space-y-10">
      <div>
        <SectionTitle
          title="Users"
          actions={
            <Button
              variant="primary"
              onClick={() => setUserDialog({ open: true, user: null })}
            >
              New user
            </Button>
          }
        />
        {users.data?.length === 0 ? (
          <EmptyHint>
            No users yet. Field staff need a user with the Data Entry role scoped to their
            org units.
          </EmptyHint>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Username</Th>
                <Th>Name</Th>
                <Th>Roles</Th>
                <Th numeric>Org units</Th>
                <Th>Status</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {users.data?.map((u) => (
                <Tr key={u.id} className="hover:bg-surface">
                  <Td className="font-mono text-[12px]">{u.username}</Td>
                  <Td className="font-medium">{u.displayName}</Td>
                  <Td className="text-ink-muted">
                    {u.roleIds.map(roleName).join(', ') || '—'}
                  </Td>
                  <Td numeric>{u.orgUnits.length}</Td>
                  <Td>
                    <span className="small-caps text-ink-muted">
                      {u.disabled ? '◌ disabled' : '● active'}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setUserDialog({ open: true, user: u })}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => userMut.remove.mutate(u.id)}
                    >
                      Delete
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
        <ErrorNote error={userMut.remove.error} />
      </div>

      <div>
        <SectionTitle
          title="Roles"
          actions={
            <Button onClick={() => setRoleDialog({ open: true, role: null })}>
              New role
            </Button>
          }
        />
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Code</Th>
              <Th>Permissions</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {roles.data?.map((r) => (
              <Tr key={r.id} className="hover:bg-surface">
                <Td className="font-medium">{r.name}</Td>
                <Td className="font-mono text-[12px]">{r.code}</Td>
                <Td className="text-ink-muted">{r.permissions.join(', ')}</Td>
                <Td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRoleDialog({ open: true, role: r })}
                  >
                    Edit
                  </Button>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>

      <Dialog
        open={userDialog.open}
        onOpenChange={(o) => setUserDialog((d) => ({ ...d, open: o }))}
      >
        <DialogContent
          title={userDialog.user ? `Edit ${userDialog.user.username}` : 'New user'}
          className="w-[min(560px,calc(100vw-2rem))]"
        >
          <UserForm
            user={userDialog.user}
            onDone={() => setUserDialog({ open: false, user: null })}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={roleDialog.open}
        onOpenChange={(o) => setRoleDialog((d) => ({ ...d, open: o }))}
      >
        <DialogContent
          title={roleDialog.role ? `Edit ${roleDialog.role.name}` : 'New role'}
        >
          <RoleForm
            role={roleDialog.role}
            onDone={() => setRoleDialog({ open: false, role: null })}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
