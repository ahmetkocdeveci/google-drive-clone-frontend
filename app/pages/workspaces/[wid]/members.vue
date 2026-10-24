<script setup lang="ts">
import type { Invitation, InviteRole, Member, Role } from '../../../../shared/types'

definePageMeta({ layout: 'workspace', middleware: ['workspace'] })

const drive = useDrive()
const route = useRoute()
const { notify } = useNotify()
const workspace = computed(() => drive.currentWorkspace.value)
const workspaceId = computed(() => String(route.params.wid || ''))
const members = ref<Member[]>([])
const invitations = ref<Invitation[]>([])
const membersCursor = ref<string | null>(null),
  invitationsCursor = ref<string | null>(null),
  moreMembersLoading = ref(false),
  moreInvitationsLoading = ref(false)
const loading = ref(true)
const error = ref('')
const mutation = ref('')
const inviteOpen = ref(false)
const inviteEmail = ref('')
const inviteRole = ref<InviteRole>('editor')
const inviteError = ref('')
const lastInvitation = ref<Invitation | null>(null)
const confirmation = ref<{
  kind: 'remove' | 'revoke' | 'transfer'
  member?: Member
  invitation?: Invitation
} | null>(null)
const confirmationError = ref('')
const isDemo = computed(() => drive.mode.value === 'demo')
const canManage = computed(
  () =>
    workspace.value?.id === workspaceId.value &&
    workspace.value.capabilities.includes('members:read'),
)
const ownerCount = computed(() => members.value.filter((member) => member.role === 'owner').length)
const pendingInvitations = computed(() =>
  invitations.value.filter((invitation) => invitation.status === 'pending'),
)
const confirmationTitle = computed(() =>
  confirmation.value?.kind === 'remove'
    ? 'Üyeyi çalışma alanından çıkar'
    : confirmation.value?.kind === 'transfer'
      ? 'Çalışma alanı sahipliğini devret'
      : 'Daveti iptal et',
)
let controller: AbortController | null = null
const pageControllers = new Set<AbortController>()
let epoch = 0
let disposed = false

const message = (cause: unknown, fallback = 'İşlem tamamlanamadı. Lütfen yeniden dene.') =>
  cause instanceof Error ? cause.message : fallback
const isAborted = (cause: unknown) => (cause as { name?: string })?.name === 'AbortError'
const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('tr-TR')
function date(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(date)
}
function isLastOwner(member: Member) {
  return (
    member.role === 'owner' &&
    (workspace.value?.ownerCount ?? (membersCursor.value ? Infinity : ownerCount.value)) <= 1
  )
}
const invitationStatus = (status: Invitation['status']) =>
  ({
    pending: 'Bekliyor',
    accepted: 'Kabul edildi',
    revoked: 'İptal edildi',
    expired: 'Süresi doldu',
  })[status]

async function load() {
  controller?.abort()
  for (const pending of pageControllers) pending.abort()
  controller = new AbortController()
  const signal = controller.signal
  const version = ++epoch
  const wid = workspaceId.value
  error.value = ''
  loading.value = true
  members.value = []
  invitations.value = []
  membersCursor.value = null
  invitationsCursor.value = null
  moreMembersLoading.value = false
  moreInvitationsLoading.value = false
  if (!canManage.value) {
    loading.value = false
    return
  }
  try {
    const result = await Promise.all([
      drive.api.listMembersPage(wid, { limit: 100 }, { signal }),
      drive.api.listInvitationsPage(wid, { limit: 100 }, { signal }),
    ])
    if (disposed || version !== epoch || wid !== workspaceId.value) return
    members.value = result[0].items
    membersCursor.value = result[0].nextCursor
    invitations.value = result[1].items
    invitationsCursor.value = result[1].nextCursor
  } catch (cause) {
    if (!disposed && version === epoch && !isAborted(cause))
      error.value = message(cause, 'Ekip bilgileri yüklenemedi.')
  } finally {
    if (!disposed && version === epoch) loading.value = false
  }
}
async function more(kind: 'members' | 'invitations') {
  const cursor = kind === 'members' ? membersCursor : invitationsCursor
  const pending = kind === 'members' ? moreMembersLoading : moreInvitationsLoading
  if (!cursor.value || pending.value || loading.value) return
  const token = cursor.value,
    version = epoch,
    wid = workspaceId.value,
    controller = new AbortController()
  pending.value = true
  error.value = ''
  pageControllers.add(controller)
  try {
    if (kind === 'members') {
      const page = await drive.api.listMembersPage(
        wid,
        { limit: 100, cursor: token },
        { signal: controller.signal },
      )
      if (disposed || version !== epoch || wid !== workspaceId.value) return
      members.value = [
        ...new Map([...members.value, ...page.items].map((member) => [member.id, member])).values(),
      ]
      cursor.value = page.nextCursor
    } else {
      const page = await drive.api.listInvitationsPage(
        wid,
        { limit: 100, cursor: token },
        { signal: controller.signal },
      )
      if (disposed || version !== epoch || wid !== workspaceId.value) return
      invitations.value = [
        ...new Map(
          [...invitations.value, ...page.items].map((invitation) => [invitation.id, invitation]),
        ).values(),
      ]
      cursor.value = page.nextCursor
    }
  } catch (cause) {
    if (!disposed && version === epoch && !isAborted(cause)) {
      error.value = message(cause)
      if ((cause as { status?: number }).status === 409) cursor.value = null
    }
  } finally {
    pageControllers.delete(controller)
    if (!disposed && version === epoch) pending.value = false
  }
}

async function refreshAfterChange(wid: string) {
  if (disposed || wid !== workspaceId.value) return
  const updated = await drive.activateWorkspace(wid)
  await drive.refreshWorkspaces()
  if (disposed || wid !== workspaceId.value) return
  if (!updated.capabilities.includes('members:read')) {
    await navigateTo(`/workspaces/${encodeURIComponent(wid)}/files`)
    return
  }
  await load()
}

async function changeRole(member: Member, event: Event) {
  const select = event.target as HTMLSelectElement
  const role = select.value as Role
  select.value = member.role
  if (role === member.role || mutation.value || isLastOwner(member)) return
  const wid = workspaceId.value
  mutation.value = member.id
  error.value = ''
  try {
    await drive.api.changeMemberRole(wid, member.id, role)
    if (!disposed && wid === workspaceId.value) {
      notify('Üyenin rolü güncellendi.', 'success')
      await refreshAfterChange(wid)
    }
  } catch (cause) {
    if (!disposed && wid === workspaceId.value) error.value = message(cause)
  } finally {
    if (!disposed) mutation.value = ''
  }
}

function openInvite() {
  inviteEmail.value = ''
  inviteRole.value = 'editor'
  inviteError.value = ''
  inviteOpen.value = true
}
async function invite() {
  if (mutation.value) return
  inviteError.value = ''
  const wid = workspaceId.value
  mutation.value = 'invite'
  try {
    const result = await drive.api.inviteMember(wid, {
      email: inviteEmail.value.trim(),
      role: inviteRole.value,
    })
    if (disposed || wid !== workspaceId.value) return
    lastInvitation.value = result
    inviteOpen.value = false
    notify(isDemo.value ? 'Demo daveti oluşturuldu.' : 'Davet oluşturuldu.', 'success')
    await load()
  } catch (cause) {
    if (!disposed && wid === workspaceId.value) inviteError.value = message(cause)
  } finally {
    if (!disposed) mutation.value = ''
  }
}

function ask(action: NonNullable<typeof confirmation.value>) {
  confirmationError.value = ''
  confirmation.value = action
}
async function confirmAction() {
  if (!confirmation.value || mutation.value) return
  const action = confirmation.value
  const wid = workspaceId.value
  mutation.value = action.member?.id || action.invitation?.id || 'confirm'
  confirmationError.value = ''
  try {
    if (action.kind === 'remove' && action.member) {
      await drive.api.removeMember(wid, action.member.id)
      if (disposed || wid !== workspaceId.value) return
      confirmation.value = null
      notify('Üye çalışma alanından çıkarıldı.', 'success')
      if (action.member.isCurrentUser) {
        drive.currentWorkspace.value = null
        await drive.refreshWorkspaces()
        await navigateTo('/workspaces')
        return
      }
      await refreshAfterChange(wid)
    } else if (action.kind === 'revoke' && action.invitation) {
      await drive.api.revokeInvitation(wid, action.invitation.id)
      if (disposed || wid !== workspaceId.value) return
      if (lastInvitation.value?.id === action.invitation.id) lastInvitation.value = null
      confirmation.value = null
      notify('Davet iptal edildi.', 'success')
      await load()
    } else if (action.kind === 'transfer' && action.member) {
      await drive.api.transferOwnership(wid, action.member.id)
      if (disposed || wid !== workspaceId.value) return
      confirmation.value = null
      notify('Sahiplik devredildi. Bu alanda artık Editor rolündesin.', 'success')
      await refreshAfterChange(wid)
    }
  } catch (cause) {
    if (!disposed && wid === workspaceId.value) {
      if (confirmation.value) confirmationError.value = message(cause)
      else
        error.value = message(
          cause,
          'İşlem tamamlandı ancak ekip bilgileri yenilenemedi. Sayfayı yeniden yükle.',
        )
    }
  } finally {
    if (!disposed) mutation.value = ''
  }
}

watch(workspaceId, () => {
  inviteOpen.value = false
  confirmation.value = null
  lastInvitation.value = null
  mutation.value = ''
  void load()
})
onMounted(load)
onBeforeUnmount(() => {
  disposed = true
  epoch++
  controller?.abort()
  for (const pending of pageControllers) pending.abort()
})
</script>

<template>
  <div class="members-page">
    <header class="page-heading">
      <div>
        <p class="eyebrow">{{ workspace?.name }}</p>
        <h1 class="page-title">Ekip arkadaşları</h1>
        <p class="page-subtitle">
          Çalışma alanına kimlerin erişebileceğini ve neler yapabileceğini yönet.
        </p>
      </div>
      <button
        v-if="canManage"
        type="button"
        class="btn btn-primary"
        :disabled="!!mutation"
        @click="openInvite"
      >
        <AppIcon name="user-plus" :size="19" />Üye davet et
      </button>
    </header>

    <div v-if="!canManage" class="empty-state">
      <AppIcon name="shield" :size="36" />
      <h2>Bu sayfaya erişimin yok</h2>
      <p>Ekip ve davet yönetimi çalışma alanı sahiplerine aittir.</p>
      <NuxtLink :to="`/workspaces/${encodeURIComponent(workspaceId)}/files`" class="btn btn-primary"
        >Dosyalara dön</NuxtLink
      >
    </div>
    <template v-else>
      <div v-if="error" class="error-panel" role="alert">
        <p>{{ error }}</p>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="loading || !!mutation"
          @click="load"
        >
          Yeniden dene
        </button>
      </div>
      <div v-if="lastInvitation?.demoToken && isDemo" class="demo-invitation">
        <AppIcon name="link" :size="20" />
        <div>
          <strong>Demo daveti hazır</strong>
          <p>{{ lastInvitation.email }} için oluşturuldu. Gerçek e-posta gönderilmez.</p>
        </div>
        <NuxtLink
          :to="{
            path: '/invitations/accept',
            hash: '#token=' + encodeURIComponent(lastInvitation.demoToken),
          }"
          class="btn btn-secondary"
          >Demo bağlantısını aç<AppIcon name="arrow-right" :size="16"
        /></NuxtLink>
      </div>

      <div v-if="loading" class="loading-block" role="status">Ekip bilgileri yükleniyor…</div>
      <template v-else>
        <section class="panel member-panel" aria-labelledby="members-title">
          <div class="section-heading">
            <h2 id="members-title">
              Üyeler <span>{{ workspace?.memberCount ?? members.length }}</span>
            </h2>
            <p class="muted">Her üyenin rolü yalnızca bu çalışma alanı için geçerlidir.</p>
          </div>
          <div class="member-table-wrap">
            <table class="member-table">
              <thead>
                <tr>
                  <th scope="col">Üye</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Katılma tarihi</th>
                  <th scope="col"><span class="visually-hidden">İşlemler</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="member in members" :key="member.id">
                  <td>
                    <div class="person">
                      <span
                        class="person-avatar"
                        :class="{ current: member.isCurrentUser }"
                        aria-hidden="true"
                        >{{ initials(member.name) }}</span
                      >
                      <div>
                        <strong
                          >{{ member.name }}
                          <span v-if="member.isCurrentUser" class="you-label">Sen</span></strong
                        ><span class="person-email">{{ member.email }}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="role-control">
                      <RoleBadge :role="member.role" /><select
                        :value="member.role"
                        class="form-input role-select"
                        :disabled="!!mutation || isLastOwner(member)"
                        :aria-label="`${member.name} için rol`"
                        :title="
                          isLastOwner(member)
                            ? 'Son Owner rolü değiştirilemez. Sahipliği başka üyeye devret.'
                            : undefined
                        "
                        @change="changeRole(member, $event)"
                      >
                        <option value="owner">Owner</option>
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option></select
                      ><small v-if="isLastOwner(member)">En az bir Owner bulunmalı</small>
                    </div>
                  </td>
                  <td class="date-cell">{{ date(member.joinedAt) }}</td>
                  <td>
                    <div class="row-actions">
                      <button
                        v-if="!member.isCurrentUser && member.role !== 'owner'"
                        class="icon-btn"
                        type="button"
                        :disabled="!!mutation"
                        :aria-label="`${member.name} kişisine sahipliği devret`"
                        title="Sahipliği devret"
                        @click="ask({ kind: 'transfer', member })"
                      >
                        <AppIcon name="shield" :size="18" /></button
                      ><button
                        class="icon-btn remove-button"
                        type="button"
                        :disabled="!!mutation || isLastOwner(member)"
                        :aria-label="`${member.name} kişisini çıkar`"
                        :title="
                          isLastOwner(member)
                            ? 'Son Owner çalışma alanından çıkarılamaz.'
                            : 'Üyeyi çıkar'
                        "
                        @click="ask({ kind: 'remove', member })"
                      >
                        <AppIcon name="trash" :size="18" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="membersCursor" class="pagination-controls">
            <button
              class="btn btn-secondary"
              type="button"
              :disabled="moreMembersLoading || !!mutation"
              @click="more('members')"
            >
              {{ moreMembersLoading ? 'Yükleniyor…' : 'Daha fazla üye' }}
            </button>
          </div>
          <p v-if="!members.length && !error" class="table-empty muted">
            Görüntülenecek üye bulunamadı.
          </p>
        </section>

        <section class="panel invitation-panel" aria-labelledby="invitations-title">
          <div class="section-heading">
            <h2 id="invitations-title">
              Davetler <span>{{ invitations.length }}</span>
            </h2>
            <p class="muted">Davetler e-posta adresine ve seçtiğin role özeldir.</p>
          </div>
          <div v-if="!invitations.length" class="invitation-empty">
            <AppIcon name="mail" :size="30" /><strong>Henüz davet yok</strong>
            <p>Ekip arkadaşlarını davet ettiğinde burada görünecek.</p>
          </div>
          <ul v-else class="invitation-list">
            <li v-for="invitation in invitations" :key="invitation.id">
              <span class="invitation-mail" aria-hidden="true"
                ><AppIcon name="mail" :size="20"
              /></span>
              <div class="invitation-person">
                <strong>{{ invitation.email }}</strong
                ><span
                  >{{ invitationStatus(invitation.status) }} · Son geçerlilik:
                  {{ date(invitation.expiresAt) }}</span
                >
              </div>
              <RoleBadge :role="invitation.role" /><button
                v-if="invitation.status === 'pending'"
                type="button"
                class="btn btn-secondary revoke-button"
                :disabled="!!mutation"
                @click="ask({ kind: 'revoke', invitation })"
              >
                Daveti iptal et
              </button>
            </li>
          </ul>
          <div v-if="invitationsCursor" class="pagination-controls">
            <button
              class="btn btn-secondary"
              type="button"
              :disabled="moreInvitationsLoading || !!mutation"
              @click="more('invitations')"
            >
              {{ moreInvitationsLoading ? 'Yükleniyor…' : 'Daha fazla davet' }}
            </button>
          </div>
        </section>
      </template>

      <aside class="role-explainer" aria-label="Rol açıklamaları">
        <div>
          <RoleBadge role="owner" />
          <p>Çalışma alanını, üyeleri ve tüm içerikleri yönetir.</p>
        </div>
        <div>
          <RoleBadge role="editor" />
          <p>Dosyaları görüntüler, ekler, düzenler ve siler.</p>
        </div>
        <div>
          <RoleBadge role="viewer" />
          <p>Dosyaları görüntüler ve indirir.</p>
        </div>
      </aside>
    </template>

    <AppModal
      :open="inviteOpen"
      title="Ekip arkadaşını davet et"
      description="Henüz hesabı olmasa da e-posta adresine davet oluşturabilirsin."
      :busy="mutation === 'invite'"
      @close="inviteOpen = false"
      ><form @submit.prevent="invite">
        <div class="form-field">
          <label for="invite-email">E-posta adresi</label
          ><input
            id="invite-email"
            v-model="inviteEmail"
            class="form-input"
            type="email"
            autocomplete="email"
            placeholder="arkadasin@sirket.com"
            required
            maxlength="254"
            :disabled="!!mutation"
          />
        </div>
        <div class="form-field">
          <label for="invite-role">Çalışma alanı rolü</label
          ><select id="invite-role" v-model="inviteRole" class="form-input" :disabled="!!mutation">
            <option value="editor">Editor — İçerikleri düzenleyebilir</option>
            <option value="viewer">Viewer — İçerikleri görüntüleyebilir</option>
          </select>
        </div>
        <p class="invite-hint muted">
          Sahiplik davetle verilmez. Katılan bir üyenin rolünü daha sonra değiştirebilirsin.
        </p>
        <p v-if="isDemo" class="demo-hint">
          Demo modunda gerçek e-posta gönderilmez; davet bağlantısı bu oturumda kullanılabilir.
        </p>
        <p v-if="inviteError" class="form-error" role="alert">{{ inviteError }}</p>
        <div class="form-actions">
          <button
            class="btn btn-secondary"
            type="button"
            :disabled="!!mutation"
            @click="inviteOpen = false"
          >
            Vazgeç</button
          ><button class="btn btn-primary" type="submit" :disabled="!!mutation">
            {{ mutation === 'invite' ? 'Oluşturuluyor…' : 'Davet oluştur' }}
          </button>
        </div>
      </form></AppModal
    >

    <AppModal
      :open="!!confirmation"
      :title="confirmationTitle"
      :busy="!!mutation"
      @close="confirmation = null"
      ><template v-if="confirmation?.kind === 'remove'"
        ><p class="confirm-copy">
          <strong>{{ confirmation.member?.name }}</strong> bu çalışma alanındaki dosyalara erişimini
          kaybedecek. Bu işlem kişinin hesabını silmez.
        </p></template
      ><template v-else-if="confirmation?.kind === 'transfer'"
        ><p class="confirm-copy">
          <strong>{{ confirmation.member?.name }}</strong> Owner olacak ve tüm çalışma alanını
          yönetebilecek. Senin rolün <strong>Editor</strong> olarak değişecek.
        </p></template
      ><template v-else
        ><p class="confirm-copy">
          <strong>{{ confirmation?.invitation?.email }}</strong> için oluşturulan davet bağlantısı
          artık kullanılamayacak.
        </p></template
      >
      <p v-if="confirmationError" class="form-error" role="alert">{{ confirmationError }}</p>
      <div class="form-actions">
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="!!mutation"
          @click="confirmation = null"
        >
          Vazgeç</button
        ><button
          type="button"
          class="btn"
          :class="confirmation?.kind === 'transfer' ? 'btn-primary' : 'btn-danger'"
          :disabled="!!mutation"
          @click="confirmAction"
        >
          {{
            mutation
              ? 'İşlem yapılıyor…'
              : confirmation?.kind === 'remove'
                ? 'Üyeyi çıkar'
                : confirmation?.kind === 'transfer'
                  ? 'Sahipliği devret'
                  : 'Daveti iptal et'
          }}
        </button>
      </div></AppModal
    >
  </div>
</template>

<style scoped>
.pagination-controls {
  padding: 20px;
  text-align: center;
}
.eyebrow {
  margin: 0 0 8px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}
.members-page {
  max-width: 1180px;
}
.error-panel {
  border: 1px solid #f0c7c4;
  background: #fff5f4;
  color: #a52a23;
  padding: 14px 18px;
  border-radius: 12px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.error-panel p {
  margin: 0;
  font-size: 13px;
}
.demo-invitation {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border: 1px solid #d1e2ff;
  background: #f0f6ff;
  border-radius: 14px;
  color: #25518f;
  margin-bottom: 24px;
}
.demo-invitation strong {
  font-size: 13px;
}
.demo-invitation p {
  font-size: 12px;
  line-height: 1.6;
  margin: 4px 0 0;
}
.demo-invitation .btn {
  margin-left: auto;
  white-space: nowrap;
}
.section-heading {
  padding: 24px 26px 20px;
}
.section-heading h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}
.section-heading h2 span {
  display: grid;
  place-items: center;
  min-width: 24px;
  height: 22px;
  border-radius: 7px;
  background: #edf2fa;
  color: #5b6d88;
  font-size: 12px;
}
.section-heading p {
  font-size: 12px;
  line-height: 1.6;
  margin: 8px 0 0;
}
.member-panel,
.invitation-panel {
  padding: 0;
  overflow: hidden;
  margin-bottom: 24px;
}
.member-table-wrap {
  overflow-x: auto;
}
.member-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.member-table th {
  padding: 13px 24px;
  background: #f8fafd;
  color: var(--muted);
  font-size: 11px;
  font-weight: 500;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.member-table td {
  padding: 20px 24px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.member-table tbody tr:last-child td {
  border-bottom: 0;
}
.person {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 210px;
}
.person-avatar {
  flex-shrink: 0;
  width: 39px;
  height: 39px;
  display: grid;
  place-items: center;
  background: #e9e6f8;
  color: #7763ad;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
}
.person-avatar.current {
  color: #245aa8;
  background: #e1ecfd;
}
.person strong {
  font-weight: 500;
}
.person-email {
  display: block;
  margin-top: 5px;
  font-size: 12px;
  color: var(--muted);
}
.you-label {
  background: #f0f3f8;
  color: #708097;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  padding: 2px 5px;
  margin-left: 4px;
}
.role-control {
  min-width: 130px;
}
.role-control > :first-child {
  display: none;
}
.role-select {
  min-height: 36px;
  padding: 6px 28px 6px 10px;
  font-size: 12px;
  min-width: 110px;
  background-color: white;
}
.role-control small {
  display: block;
  margin-top: 6px;
  color: var(--muted);
  font-size: 10px;
  white-space: nowrap;
}
.date-cell {
  color: var(--muted);
  white-space: nowrap;
}
.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
.remove-button {
  color: #9a6770;
}
.remove-button:hover:not(:disabled) {
  color: #b3261e;
  background: #fce8e6;
}
.invitation-empty {
  padding: 24px 20px 34px;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 12px;
  color: var(--muted);
}
.invitation-empty strong {
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
}
.invitation-empty p {
  margin: 0;
  font-size: 12px;
}
.invitation-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.invitation-list li {
  border-top: 1px solid var(--line);
  padding: 20px 26px;
  display: flex;
  align-items: center;
  gap: 14px;
}
.invitation-mail {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 50%;
  color: #6b7d9a;
  background: #f1f4f9;
}
.invitation-person {
  flex: 1;
  min-width: 0;
}
.invitation-person strong {
  font-size: 13px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.invitation-person span {
  display: block;
  color: var(--muted);
  margin-top: 5px;
  font-size: 11px;
}
.revoke-button {
  font-size: 12px;
  padding: 8px 12px;
}
.role-explainer {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  padding: 8px 6px;
}
.role-explainer p {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.7;
  margin: 10px 0 0;
}
.invite-hint,
.demo-hint,
.confirm-copy {
  font-size: 13px;
  line-height: 1.8;
}
.demo-hint {
  border-radius: 10px;
  background: #edf4ff;
  color: #44618d;
  padding: 12px 14px;
  font-size: 12px;
}
.confirm-copy {
  margin: 0 0 24px;
  color: var(--muted);
}
.confirm-copy strong {
  color: var(--text);
}
.table-empty {
  padding: 0 26px 24px;
  font-size: 13px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 800px) {
  .member-table th,
  .member-table td {
    padding-left: 16px;
    padding-right: 16px;
  }
  .member-table th:nth-child(3),
  .member-table td:nth-child(3) {
    display: none;
  }
  .role-explainer {
    gap: 18px;
  }
  .section-heading {
    padding: 22px 18px;
  }
  .invitation-list li {
    padding: 18px;
    flex-wrap: wrap;
  }
  .invitation-list li > .role-badge {
    margin-left: 52px;
  }
  .invitation-person {
    flex-basis: calc(100% - 52px);
  }
  .demo-invitation {
    flex-wrap: wrap;
  }
  .demo-invitation .btn {
    margin-left: 34px;
  }
}
@media (max-width: 520px) {
  .role-explainer {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .person {
    min-width: 170px;
  }
  .person-avatar {
    display: none;
  }
  .row-actions {
    flex-direction: column;
  }
  .member-table td {
    padding-left: 12px;
    padding-right: 12px;
  }
  .role-select {
    min-width: 98px;
  }
  .error-panel {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
