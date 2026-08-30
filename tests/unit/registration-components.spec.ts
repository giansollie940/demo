import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import RegistrationStatusBadge from '../../src/components/registrations/RegistrationStatusBadge.vue'
import StudySessionCard from '../../src/components/registrations/StudySessionCard.vue'
import RegistrationDialog from '../../src/components/registrations/RegistrationDialog.vue'
import RegistrationPage from '../../src/pages/RegistrationPage.vue'
import { routes } from '../../src/app/router/routes'

const week = { id: 'week-1', number: 1, startDate: '2026-08-24', endDate: '2026-08-30', status: 'open' }
const period = { n: 1, start: '07:00', end: '07:40' }
const baseEligibility = {
  regularNewAllowed: true, editable: false, emergencyAllowed: false,
  started: false, pastDeadline: false, reported: false, readOnlyReason: null,
} as const

describe('RegistrationStatusBadge', () => {
  it('renders status text and icon semantics', async () => {
    expect(await renderToString(h(RegistrationStatusBadge, { status: 'approved' }))).toContain('Đã duyệt')
    expect(await renderToString(h(RegistrationStatusBadge, { status: 'revision_overdue' }))).toContain('Báo cáo lỗi')
  })
})

describe('StudySessionCard', () => {
  it('offers regular, emergency, and locked actions from eligibility', async () => {
    const regular = await renderToString(h(StudySessionCard, {
      week, period, dow: 0, registration: null, eligibility: baseEligibility,
    }))
    expect(regular).toContain('Đăng ký ngay')
    const emergency = await renderToString(h(StudySessionCard, {
      week, period, dow: 0, registration: null,
      eligibility: { ...baseEligibility, regularNewAllowed: false, emergencyAllowed: true, pastDeadline: true },
    }))
    expect(emergency).toContain('Đăng ký bổ sung')
    const locked = await renderToString(h(StudySessionCard, {
      week, period, dow: 0, registration: null,
      eligibility: { ...baseEligibility, regularNewAllowed: false, started: true, readOnlyReason: 'started' },
    }))
    expect(locked).toContain('Đã qua buổi')
  })
})

describe('RegistrationDialog', () => {
  it('renders labelled regular fields with stable helper/error semantics', async () => {
    const html = await renderToString(h(RegistrationDialog, {
      open: true, mode: 'regular', week, period, dow: 0, registration: null,
      eligibility: baseEligibility, saving: false, error: '',
    }))
    expect(html).toContain('<dialog')
    expect(html).toContain('maxlength="180"')
    expect(html).toContain('maxlength="500"')
    expect(html).toContain('Sử dụng thiết bị điện tử')
    expect(html).toContain('Lưu nháp')
    expect(html).toContain('Gửi đăng ký')
  })

  it('requires an emergency reason and exposes its helper text', async () => {
    const html = await renderToString(h(RegistrationDialog, {
      open: true, mode: 'emergency', week, period, dow: 0, registration: null,
      eligibility: { ...baseEligibility, regularNewAllowed: false, emergencyAllowed: true },
      saving: false, error: '',
    }))
    expect(html).toContain('Lý do đăng ký bổ sung')
    expect(html).toContain('Lý do này sẽ được gửi cho giáo viên.')
    expect(html).toContain('Gửi đăng ký bổ sung')
  })
})

describe('registration route', () => {
  it('resolves to the real RegistrationPage component', () => {
    const shell = routes.find(item => item.path === '/')
    expect(shell?.children?.find(item => item.path === 'register')?.component).toBe(RegistrationPage)
  })
})
