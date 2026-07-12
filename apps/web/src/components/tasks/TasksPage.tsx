'use client'

import React, { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { P } from '@/lib/palette'
import { useAuth } from '@/contexts/AuthContext'
import FbrCaseDetail from '../fbr/FbrCaseDetail'
import StyledSelect from '@/components/ui/StyledSelect'

const NAVY = '#132E57'
const TEAL = '#1E8496'

const TAX_TABS = [
  { key: 'sales_tax',  label: 'Sales Tax',        color: '#1E8496', bg: '#E5F3F5' },
  { key: 'income_tax', label: 'Income Tax',        color: '#7B2D8E', bg: '#F3E8F7' },
  { key: 'wht',        label: 'Withholding Tax',   color: '#C25A1F', bg: '#F5E0D2' },
  { key: 'notices',    label: 'Notices & Appeals', color: '#1565C0', bg: '#E3F0FB' },
  { key: 'general',    label: 'General Tasks',     color: '#374151', bg: '#F3F4F6' },
]

// ── Pipeline constants ────────────────────────────────────────────────────────

const PIPE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  DATA_COLLECTION:     { label: 'Data Collection',     color: '#3A6B3A', bg: '#EBF5EB' },
  DRAFT_PREPARATION:   { label: 'Draft Preparation',   color: '#1E8496', bg: '#E5F3F5' },
  CLIENT_REVIEW:       { label: 'Client Review',       color: '#D7A520', bg: '#FAEFD0' },
  ANNEXURE_UPLOAD:     { label: 'Annexure Upload',     color: '#7B2D8E', bg: '#F3E8F7' },
  INCHARGE_REVIEW:     { label: 'Incharge Review',     color: '#C25A1F', bg: '#F5E0D2' },
  CHALLAN_GENERATED:   { label: 'Challan / PSID',      color: '#132E57', bg: '#E8EEF7' },
  SUBMISSION_APPROVAL: { label: 'Submission Approval', color: '#C25A1F', bg: '#F5E0D2' },
  FILED:               { label: 'Filed',               color: '#3A6B3A', bg: '#EBF5EB' },
  COMPLETED:           { label: 'Completed',           color: '#3A6B3A', bg: '#D4EDDA' },
  SENT_BACK:           { label: 'Sent Back',           color: '#D62828', bg: '#FDECEA' },
}
const ADVANCE_LABEL: Record<string,string> = {
  DATA_COLLECTION:'Mark Data Collected', DRAFT_PREPARATION:'Send to Client for Review',
  CLIENT_REVIEW:'Client Reviewed, Move Forward', ANNEXURE_UPLOAD:'Annexures Uploaded, Submit to Manager',
  CHALLAN_GENERATED:'Challan Attached, Request Final Approval', FILED:'Mark as Filed & Issue Invoice',
}

type StepDef = { key: string; label: string; by: string }

// Fallback hardcoded steps used until API responds
const DEFAULT_STEPS: StepDef[] = [
  { key:'DATA_COLLECTION',    label:'Collection of Data from Client',                     by:'Trainee' },
  { key:'DRAFT_PREPARATION',  label:'Prepare Draft Return',                               by:'Trainee' },
  { key:'CLIENT_REVIEW',      label:'Share draft return with client for approval',        by:'Trainee' },
  { key:'ANNEXURE_UPLOAD',    label:'Upload Draft Return on Portal',                      by:'Trainee' },
  { key:'INCHARGE_REVIEW',    label:'Get it reviewed by Job-Incharge',                    by:'Manager' },
  { key:'CHALLAN_GENERATED',  label:'Generate Challan / PSID and sent to Client',         by:'Trainee' },
  { key:'SUBMISSION_APPROVAL',label:'Get approval from Job In-Charge for Submission',     by:'Manager' },
  { key:'FILED',              label:'Submit your task',                                    by:'Trainee' },
]

// Convert DB PipelineStepConfig record → StepDef
const toStepDef = (s: any): StepDef => ({
  key:   s.stepKey,
  label: s.label,
  by:    s.approvedBy === 'MANAGER' ? 'Manager' : 'Trainee',
})

const TAX_AUTHORITIES = [
  { key: 'FBR',  label: 'FBR',  color: '#132E57', bg: '#E8EEF7' },
  { key: 'PRA',  label: 'PRA',  color: '#7B2D8E', bg: '#F3E8F7' },
  { key: 'SRB',  label: 'SRB',  color: '#C25A1F', bg: '#F5E0D2' },
  { key: 'KPRA', label: 'KPRA', color: '#1E8496', bg: '#E5F3F5' },
  { key: 'BRA',  label: 'BRA',  color: '#D7A520', bg: '#FAEFD0' },
  { key: 'AJK',  label: 'AJK',  color: '#3A6B3A', bg: '#EBF5EB' },
]
const authorityStyle = (key: string) => TAX_AUTHORITIES.find(a => a.key === key) ?? { color: NAVY, bg: '#EEE' }

const RETURN_TYPES = [
  { key: 'ORIGINAL', label: 'Original', color: '#0F766E', bg: '#F0FDFA' },
  { key: 'REVISED',  label: 'Revised',  color: '#B45309', bg: '#FFFBEB' },
]
const returnTypeStyle = (key: string) => RETURN_TYPES.find(r => r.key === key) ?? RETURN_TYPES[0]

// ── General task constants ────────────────────────────────────────────────────

const GEN_STATUS: Record<string,{ label:string; color:string; bg:string }> = {
  TODO:        { label: 'To Do',       color: '#5C5C5C', bg: '#F3F4F6' },
  IN_PROGRESS: { label: 'In Progress', color: TEAL,      bg: '#E5F3F5' },
  DONE:        { label: 'Done',        color: '#3A6B3A', bg: '#EBF5EB' },
}
const GEN_PRIORITY: Record<string,{ label:string; color:string }> = {
  LOW:    { label: 'Low',    color: '#3A6B3A' },
  MEDIUM: { label: 'Medium', color: '#D7A520' },
  HIGH:   { label: 'High',   color: '#D62828' },
}

function monthName(m: number) {
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]
}

// Period display: depends on taskType stored in DB
function periodLabel(taskType: string | undefined, periodMonth: number, periodYear: number) {
  if (taskType === 'INCOME_TAX') return `FY ${periodYear}`
  if (taskType === 'WHT') return `Q${periodMonth} ${periodYear}`
  return `${monthName(periodMonth)} ${periodYear}`
}

// Whether the active tab uses Sales Tax pipeline (with authority / month selection)
const TAX_TYPE_MAP: Record<string, string> = { sales_tax: 'SALES_TAX', income_tax: 'INCOME_TAX', wht: 'WHT' }

function PipeStatusBadge({ status }: { status: string }) {
  const m = PIPE_STATUS[status] ?? { label: status, color: NAVY, bg: '#eee' }
  return <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:"'Aptos',sans-serif", color:m.color, background:m.bg, border:`1px solid ${m.color}22` }}>{m.label}</span>
}

function GenStatusBadge({ status }: { status: string }) {
  const m = GEN_STATUS[status] ?? { label: status, color: NAVY, bg: '#eee' }
  return <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:"'Aptos',sans-serif", color:m.color, background:m.bg }}>{m.label}</span>
}

function PriorityDot({ priority }: { priority: string }) {
  const c = GEN_PRIORITY[priority]?.color ?? '#888'
  return <span style={{ width:8, height:8, borderRadius:'50%', background:c, display:'inline-block', flexShrink:0 }} />
}

interface Props { role: 'trainee' | 'manager' | 'team_lead' | 'admin'; defaultManagerView?: 'my' | 'approval'; completedOnly?: boolean; incompleteOnly?: boolean }

export default function TasksPage({ role, defaultManagerView = 'approval', completedOnly = false, incompleteOnly = false }: Props) {
  const { permissions } = useAuth()
  const canDeleteTask        = role === 'admin' || (permissions as any)['task_delete']        === true
  const canMarkIncomplete    = role === 'admin' || (permissions as any)['task_mark_incomplete'] === true

  const [activeTax,       setActiveTax]       = useState('sales_tax')
  const [managerView,     setManagerView]     = useState<'my'|'approval'>(defaultManagerView)
  const [tabCounts,       setTabCounts]       = useState<Record<string,number>>({})
  const [search,          setSearch]          = useState('')
  const [listCollapsed,   setListCollapsed]   = useState(false)
  const [toast,           setToast]           = useState<{msg:string;ok:boolean}|null>(null)

  // Pipeline state
  const [pipeTasks,       setPipeTasks]       = useState<any[]>([])
  const [pipeLoading,     setPipeLoading]     = useState(false)
  const [selectedPipe,    setSelectedPipe]    = useState<any>(null)
  const [actionLoading,   setActionLoading]   = useState(false)
  const [sendBackModal,   setSendBackModal]   = useState(false)
  const [sendBackComment, setSendBackComment] = useState('')
  const [advanceModal,    setAdvanceModal]    = useState(false)
  const [advanceForm,     setAdvanceForm]     = useState<Record<string,string>>({})

  // Custom step state
  const [addStepModal,      setAddStepModal]      = useState<{ open: boolean; insertAfter: string }>({ open: false, insertAfter: '' })
  const [addStepForm,       setAddStepForm]       = useState({ title: '', description: '', approvedBy: 'TRAINEE' as 'TRAINEE' | 'MANAGER' })
  const [deleteStepModal,   setDeleteStepModal]   = useState(false)
  const [deleteStepId,      setDeleteStepId]      = useState('')
  const [customStepLoading, setCustomStepLoading] = useState(false)
  const [adminDeleteConfirm, setAdminDeleteConfirm] = useState(false)
  const [adminRevertConfirm, setAdminRevertConfirm] = useState(false)
  const [adminActionLoading, setAdminActionLoading] = useState(false)
  const [fbrDeleteConfirm,   setFbrDeleteConfirm]   = useState(false)
  const [fbrRevertConfirm,   setFbrRevertConfirm]   = useState(false)
  const [fbrActionLoading,   setFbrActionLoading]   = useState(false)

  // Assign task modal (manager/admin only)
  const [assignModal,     setAssignModal]     = useState(false)
  const [assignForm,      setAssignForm]      = useState({ clientId:'', traineeId:'', periodMonth: new Date().getMonth()+1, periodYear: new Date().getFullYear(), dueDate:'', authority:'FBR', returnType:'ORIGINAL' })
  const [assignLoading,   setAssignLoading]   = useState(false)
  const [clientList,      setClientList]      = useState<any[]>([])
  const [traineeList,     setTraineeList]     = useState<any[]>([])

  // General tasks state
  const [genTasks,        setGenTasks]        = useState<any[]>([])
  const [genLoading,      setGenLoading]      = useState(false)
  const [selectedGen,     setSelectedGen]     = useState<any>(null)
  const [genActLoading,   setGenActLoading]   = useState(false)

  // FBR cases state (Notices & Appeals tab)
  const [fbrCases,    setFbrCases]    = useState<any[]>([])
  const [fbrLoading,  setFbrLoading]  = useState(false)
  const [selectedFbr, setSelectedFbr] = useState<any>(null)

  // Pipeline step config (fetched from API, refreshed when tax type changes)
  const [pipelineSteps,   setPipelineSteps]   = useState<StepDef[]>(DEFAULT_STEPS)

  // Completed Tasks filters
  const [filterTrainee,   setFilterTrainee]   = useState('all')
  const [filterAuthority, setFilterAuthority] = useState('all')
  const [filterReturnType, setFilterReturnType] = useState('all')
  const [filterStatus,    setFilterStatus]    = useState('all')
  const [filterTime,      setFilterTime]      = useState<'all'|'this_month'|'this_year'|'custom'>('all')
  const [filterFrom,      setFilterFrom]      = useState('')
  const [filterTo,        setFilterTo]        = useState('')

  // Pipeline on Sales Tax / Income Tax / WHT tabs for all roles
  const isPipelineView = (activeTax === 'sales_tax' || activeTax === 'income_tax' || activeTax === 'wht') && (role === 'trainee' || role === 'admin' || incompleteOnly || role === 'manager' || role === 'team_lead')
  const isFbrView      = activeTax === 'notices'
  const isGenView      = activeTax === 'general'
  const isSalesTaxTab  = activeTax === 'sales_tax'
  const activeTab      = TAX_TABS.find(t => t.key === activeTax)!

  const showToast = (msg: string, ok = true) => { setToast({msg,ok}); setTimeout(()=>setToast(null),3000) }

  // ── Restore last active tab from sessionStorage (after hydration) ──────────
  const tabStorageKey = completedOnly ? 'ca_active_tab_completed' : incompleteOnly ? 'ca_active_tab_incomplete' : 'ca_active_tab'
  useEffect(() => {
    const saved = sessionStorage.getItem(tabStorageKey)
    if (saved) setActiveTax(saved)
  }, [])

  // ── Fetch tab summary counts ────────────────────────────────────────────────
  useEffect(() => {
    api.get('/sales-tax-tasks/summary-counts')
      .then(r => {
        const d = r.data?.data ?? r.data
        setTabCounts(prev => ({ ...prev, sales_tax: d.SALES_TAX ?? 0, income_tax: d.INCOME_TAX ?? 0, wht: d.WHT ?? 0, notices: d.NOTICES ?? 0 }))
      })
      .catch(() => {})
  }, [])

  // ── Fetch pipeline tasks ────────────────────────────────────────────────────
  const fetchPipeTasks = useCallback(async () => {
    if (!isPipelineView) { setPipeTasks([]); return }
    setPipeLoading(true)
    try {
      const taskType = TAX_TYPE_MAP[activeTax] ?? 'SALES_TAX'
      const base = (role === 'trainee' || defaultManagerView === 'my') ? '/sales-tax-tasks/my' : incompleteOnly ? '/sales-tax-tasks/approvals?all=true' : '/sales-tax-tasks/approvals'
      const sep = base.includes('?') ? '&' : '?'
      const { data } = await api.get(`${base}${sep}taskType=${taskType}`)
      setPipeTasks(Array.isArray(data) ? data : data.data ?? [])
    } catch (e: any) { console.error('[fetchPipeTasks] error:', e?.response?.status, e?.response?.data ?? e?.message); setPipeTasks([]) }
    finally { setPipeLoading(false) }
  }, [isPipelineView, role, incompleteOnly, activeTax, defaultManagerView])

  // ── Fetch general tasks ─────────────────────────────────────────────────────
  const fetchGenTasks = useCallback(async () => {
    setGenLoading(true)
    try {
      const { data } = await api.get('/tasks', { params: { taxType: 'general' } })
      const all = Array.isArray(data) ? data : data.data ?? []
      setGenTasks(all)
      setTabCounts(prev => ({ ...prev, general: all.filter((t:any) => t.status !== 'DONE').length }))
    } catch { setGenTasks([]) }
    finally { setGenLoading(false) }
  }, [])

  // ── Fetch FBR cases (Notices & Appeals tab) ─────────────────────────────────
  const fetchFbrCases = useCallback(async () => {
    if (!isFbrView) { setFbrCases([]); return }
    setFbrLoading(true)
    try {
      const { data } = await api.get('/fbr/cases')
      setFbrCases(Array.isArray(data) ? data : data.data ?? [])
    } catch { setFbrCases([]) }
    finally { setFbrLoading(false) }
  }, [isFbrView])

  useEffect(() => { fetchPipeTasks() }, [fetchPipeTasks])
  useEffect(() => { fetchGenTasks()  }, [fetchGenTasks])
  useEffect(() => { fetchFbrCases()  }, [fetchFbrCases])

  const openAssignModal = async () => {
    setAssignModal(true)
    try {
      const [cl, tl] = await Promise.all([
        api.get('/tasks/clients'),
        api.get('/tasks/assignable-users'),
      ])
      const clients = cl.data?.data ?? cl.data ?? []
      const users   = tl.data?.data ?? tl.data ?? []
      setClientList(clients)
      setTraineeList(users)
    } catch { /* ignore */ }
  }

  const submitAssignTask = async () => {
    if (!assignForm.clientId || !assignForm.traineeId) return
    setAssignLoading(true)
    try {
      const taskType    = TAX_TYPE_MAP[activeTax] ?? 'SALES_TAX'
      const periodMonth = activeTax === 'income_tax' ? 0 : Number(assignForm.periodMonth)
      await api.post('/sales-tax-tasks', {
        clientId:    assignForm.clientId,
        traineeId:   assignForm.traineeId,
        periodMonth,
        periodYear:  Number(assignForm.periodYear),
        dueDate:     assignForm.dueDate || undefined,
        taskType,
        ...(activeTax === 'sales_tax' ? { authority: assignForm.authority, returnType: assignForm.returnType } : {}),
      })
      setAssignModal(false)
      setAssignForm({ clientId:'', traineeId:'', periodMonth: new Date().getMonth()+1, periodYear: new Date().getFullYear(), dueDate:'', authority:'FBR', returnType:'ORIGINAL' })
      showToast('Task assigned successfully')
      fetchPipeTasks()
    } catch (e:any) {
      showToast(e?.response?.data?.message ?? 'Failed to assign task', false)
    } finally { setAssignLoading(false) }
  }

  useEffect(() => { setSelectedPipe(null); setSelectedGen(null); setSelectedFbr(null); setListCollapsed(false) }, [activeTax, managerView])

  // Fetch current step config whenever the active tax tab changes (for incomplete tasks display)
  useEffect(() => {
    if (!isPipelineView) return
    const TAX_TYPE_MAP: Record<string, string> = { sales_tax: 'SALES_TAX', income_tax: 'INCOME_TAX', wht: 'WHT' }
    const taskType = TAX_TYPE_MAP[activeTax] ?? 'SALES_TAX'
    api.get('/pipeline-steps', { params: { taskType } })
      .then(res => {
        const rows: any[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? [])
        if (rows.length > 0) setPipelineSteps(rows.filter((s: any) => s.isActive !== false).map(toStepDef))
      })
      .catch(() => { /* keep fallback */ })
  }, [activeTax, isPipelineView])

  const uw = (r: any) => r?.data ?? r

  // ── Pipeline actions ────────────────────────────────────────────────────────
  const handleAdvance = async () => {
    if (!selectedPipe) return
    setActionLoading(true)
    try {
      const ep = selectedPipe.status === 'SENT_BACK'
        ? `/sales-tax-tasks/${selectedPipe.id}/resubmit`
        : `/sales-tax-tasks/${selectedPipe.id}/advance`
      const { comment, attachment, annexureA, annexureC, psid, challanAmount, feeInvoiceNo, feeInvoiceAmount } = advanceForm
      const advancePayload = { comment, attachment, annexureA, annexureC, psid, challanAmount, feeInvoiceNo, feeInvoiceAmount }
      const res = await api.post(ep, advancePayload)
      const task = uw(res.data)

      const numField = (k: string) => { const v = advanceForm[k]; return v !== '' && v != null ? Number(String(v).replace(/,/g,'')) : undefined }

      // When SALES_TAX FILED step completes, save sales tax summary data
      if (selectedPipe.status === 'FILED' && selectedPipe.taskType === 'SALES_TAX') {
        await api.post('/sales-tax-returns', {
          clientId:              selectedPipe.clientId,
          taskId:                selectedPipe.id,
          periodMonth:           selectedPipe.periodMonth,
          periodYear:            selectedPipe.periodYear,
          authority:             selectedPipe.authority ?? 'FBR',
          returnType:            selectedPipe.returnType ?? 'ORIGINAL',
          standardSales:         numField('standardSales'),
          outputTaxStandard:     numField('outputTaxStandard'),
          reducedRateSales:      numField('reducedRateSales'),
          outputTaxReduced:      numField('outputTaxReduced'),
          exemptSales:           numField('exemptSales'),
          zeroRatedSales:        numField('zeroRatedSales'),
          standardPurchases:     numField('standardPurchases'),
          inputTaxStandard:      numField('inputTaxStandard'),
          reducedRatePurchases:  numField('reducedRatePurchases'),
          inputTaxReduced:       numField('inputTaxReduced'),
          unregisteredPurchases: numField('unregisteredPurchases'),
          exemptPurchases:       numField('exemptPurchases'),
          zeroRatedPurchases:    numField('zeroRatedPurchases'),
          normalTaxPayable:      numField('normalTaxPayable'),
          furtherTaxPayable:     numField('furtherTaxPayable'),
          taxCarryForward:       numField('taxCarryForward'),
        }).catch(() => {})
      }

      // When INCOME_TAX FILED step completes, save income tax summary data
      if (selectedPipe.status === 'FILED' && selectedPipe.taskType === 'INCOME_TAX') {
        await api.post('/income-tax-returns', {
          clientId:              selectedPipe.clientId,
          taskId:                selectedPipe.id,
          periodYear:            selectedPipe.periodYear,
          totalProfitLoss:       numField('totalProfitLoss'),
          profitLossExempt:      numField('profitLossExempt'),
          amountSubjectNormal:   numField('amountSubjectNormal'),
          normalIncomeTax:       numField('normalIncomeTax'),
          turnoverTax:           numField('turnoverTax'),
          taxOnAccountingProfit: numField('taxOnAccountingProfit'),
          differenceMinimumTax:  numField('differenceMinimumTax'),
          superTax:              numField('superTax'),
          taxChargeable:         numField('taxChargeable'),
          admittedIncomeTax:     numField('admittedIncomeTax'),
          refundableIncomeTax:   numField('refundableIncomeTax'),
        }).catch(() => {})
      }

      setSelectedPipe(task); setPipeTasks(p => p.map(t => t.id === task.id ? task : t))
      setAdvanceModal(false); setAdvanceForm({}); showToast('Status updated')
    } catch (e:any) { showToast(e?.response?.data?.message ?? 'Failed', false) }
    finally { setActionLoading(false) }
  }
  const handleClientReviewed = async () => {
    if (!selectedPipe) return
    setActionLoading(true)
    try {
      const res = await api.post(`/sales-tax-tasks/${selectedPipe.id}/client-reviewed`)
      const task = uw(res.data)
      setSelectedPipe(task); setPipeTasks(p => p.map(t => t.id === task.id ? task : t))
      showToast('Moved to Annexure Upload stage')
    } catch (e:any) { showToast(e?.response?.data?.message ?? 'Failed', false) }
    finally { setActionLoading(false) }
  }
  const handleManagerApprove = async () => {
    if (!selectedPipe) return
    setActionLoading(true)
    try {
      const res = await api.post(`/sales-tax-tasks/${selectedPipe.id}/approve`, {})
      const task = uw(res.data)
      setSelectedPipe(task); setPipeTasks(p => p.map(t => t.id === task.id ? task : t))
      showToast('Approved successfully')
    } catch (e:any) { showToast(e?.response?.data?.message ?? 'Failed', false) }
    finally { setActionLoading(false) }
  }
  const handleManagerSendBack = async () => {
    if (!sendBackComment.trim()) return
    setActionLoading(true)
    try {
      const res = await api.post(`/sales-tax-tasks/${selectedPipe.id}/send-back`, { comment: sendBackComment })
      const task = uw(res.data)
      setSelectedPipe(task); setPipeTasks(p => p.map(t => t.id === task.id ? task : t))
      setSendBackModal(false); setSendBackComment(''); showToast('Sent back to trainee')
    } catch (e:any) { showToast(e?.response?.data?.message ?? 'Failed', false) }
    finally { setActionLoading(false) }
  }

  const handleRevert = async () => {
    if (!selectedPipe) return
    setActionLoading(true)
    try {
      const res = await api.post(`/sales-tax-tasks/${selectedPipe.id}/revert`, {})
      const task = uw(res.data)
      setSelectedPipe(task); setPipeTasks(p => p.map(t => t.id === task.id ? task : t))
      showToast('Step undone')
    } catch (e:any) { showToast(e?.response?.data?.message ?? 'Failed to undo', false) }
    finally { setActionLoading(false) }
  }

  // ── Admin: delete / revert completed task ──────────────────────────────────
  const handleAdminDelete = async () => {
    if (!selectedPipe) return
    setAdminActionLoading(true)
    try {
      await api.delete(`/sales-tax-tasks/${selectedPipe.id}`)
      setAdminDeleteConfirm(false)
      setSelectedPipe(null)
      setPipeTasks(p => p.filter(t => t.id !== selectedPipe.id))
      showToast('Task deleted successfully')
    } catch (e:any) { showToast(e?.response?.data?.message ?? 'Failed to delete', false) }
    finally { setAdminActionLoading(false) }
  }

  const handleAdminRevert = async () => {
    if (!selectedPipe) return
    setAdminActionLoading(true)
    try {
      const res = await api.post(`/sales-tax-tasks/${selectedPipe.id}/revert-to-incomplete`, {})
      const task = uw(res.data)
      setAdminRevertConfirm(false)
      setSelectedPipe(task)
      setPipeTasks(p => p.map(t => t.id === task.id ? task : t))
      showToast('Task reverted to incomplete')
    } catch (e:any) { showToast(e?.response?.data?.message ?? 'Failed to revert', false) }
    finally { setAdminActionLoading(false) }
  }

  // ── FBR case: delete / reopen ───────────────────────────────────────────────
  const handleFbrDelete = async () => {
    if (!selectedFbr) return
    setFbrActionLoading(true)
    try {
      await api.delete(`/fbr/cases/${selectedFbr.id}`)
      setFbrDeleteConfirm(false)
      setSelectedFbr(null)
      setFbrCases(p => p.filter(c => c.id !== selectedFbr.id))
      showToast('Case deleted')
    } catch (e:any) { showToast(e?.response?.data?.message ?? 'Failed to delete', false) }
    finally { setFbrActionLoading(false) }
  }

  const handleFbrReopen = async () => {
    if (!selectedFbr) return
    setFbrActionLoading(true)
    try {
      const res = await api.post(`/fbr/cases/${selectedFbr.id}/reopen`, {})
      const updated = res.data?.data ?? res.data
      setFbrRevertConfirm(false)
      setSelectedFbr(updated)
      setFbrCases(p => p.map(c => c.id === updated.id ? updated : c))
      showToast('Case marked as incomplete')
    } catch (e:any) { showToast(e?.response?.data?.message ?? 'Failed to reopen', false) }
    finally { setFbrActionLoading(false) }
  }

  // ── Custom step actions ─────────────────────────────────────────────────────
  const refreshPipe = async (id: string) => {
    const res = await api.get(`/sales-tax-tasks/${id}`)
    const task = uw(res.data)
    setSelectedPipe(task); setPipeTasks(p => p.map(t => t.id === task.id ? task : t))
    return task
  }
  const handleAddCustomStep = async () => {
    if (!addStepForm.title.trim() || !selectedPipe) return
    setCustomStepLoading(true)
    try {
      await api.post(`/sales-tax-tasks/${selectedPipe.id}/custom-steps`, {
        title: addStepForm.title.trim(), description: addStepForm.description || undefined,
        approvedBy: addStepForm.approvedBy, insertAfter: addStepModal.insertAfter,
      })
      await refreshPipe(selectedPipe.id)
      setAddStepModal({ open: false, insertAfter: '' }); setAddStepForm({ title: '', description: '', approvedBy: 'TRAINEE' })
      showToast('Custom step added')
    } catch (e:any) { showToast(e?.response?.data?.message ?? 'Failed', false) }
    finally { setCustomStepLoading(false) }
  }
  const handleCompleteCustomStep = async (stepId: string) => {
    if (!selectedPipe) return
    setCustomStepLoading(true)
    try {
      await api.post(`/sales-tax-tasks/${selectedPipe.id}/custom-steps/${stepId}/complete`)
      await refreshPipe(selectedPipe.id); showToast('Step marked done')
    } catch (e:any) { showToast(e?.response?.data?.message ?? 'Failed', false) }
    finally { setCustomStepLoading(false) }
  }
  const handleDeleteCustomStep = async (stepId: string) => {
    if (!selectedPipe) return
    setCustomStepLoading(true)
    try {
      await api.delete(`/sales-tax-tasks/${selectedPipe.id}/custom-steps/${stepId}`)
      await refreshPipe(selectedPipe.id); showToast('Step removed')
    } catch (e:any) { showToast(e?.response?.data?.message ?? 'Failed', false) }
    finally { setCustomStepLoading(false) }
  }

  // ── General task actions ────────────────────────────────────────────────────
  const [genNewStep,        setGenNewStep]        = useState('')
  const [genStepLoading,    setGenStepLoading]    = useState(false)
  const [genDeleteConfirm,  setGenDeleteConfirm]  = useState(false)

  const handleGenStatus = async (status: string) => {
    if (!selectedGen) return
    setGenActLoading(true)
    try {
      const res = await api.patch(`/tasks/${selectedGen.id}`, { status })
      const task = uw(res.data)
      setSelectedGen(task); setGenTasks(p => p.map(t => t.id === task.id ? task : t))
      showToast('Status updated')
    } catch { showToast('Failed', false) }
    finally { setGenActLoading(false) }
  }

  const refreshSelectedGen = async () => {
    if (!selectedGen) return
    try {
      const res = await api.get(`/tasks`, { params: { taxType: 'general' } })
      const all = Array.isArray(res.data) ? res.data : res.data?.data ?? []
      const updated = all.find((t: any) => t.id === selectedGen.id)
      if (updated) { setSelectedGen(updated); setGenTasks(all) }
    } catch {}
  }

  const handleGenAddStep = async () => {
    if (!selectedGen || !genNewStep.trim()) return
    setGenStepLoading(true)
    try {
      await api.post(`/tasks/${selectedGen.id}/steps`, { title: genNewStep.trim() })
      setGenNewStep('')
      await refreshSelectedGen()
    } catch { showToast('Failed to add step', false) }
    finally { setGenStepLoading(false) }
  }

  const handleGenToggleStep = async (stepId: string) => {
    if (!selectedGen) return
    setGenStepLoading(true)
    try {
      const res = await api.patch(`/tasks/${selectedGen.id}/steps/${stepId}/toggle`, {})
      const task = uw(res.data)
      setSelectedGen(task); setGenTasks(p => p.map(t => t.id === task.id ? task : t))
    } catch { showToast('Failed', false) }
    finally { setGenStepLoading(false) }
  }

  const handleGenDeleteStep = async (stepId: string) => {
    if (!selectedGen) return
    setGenStepLoading(true)
    try {
      const res = await api.delete(`/tasks/${selectedGen.id}/steps/${stepId}`)
      const task = uw(res.data)
      setSelectedGen(task); setGenTasks(p => p.map(t => t.id === task.id ? task : t))
    } catch { showToast('Failed', false) }
    finally { setGenStepLoading(false) }
  }

  const handleGenDelete = async () => {
    if (!selectedGen) return
    setGenActLoading(true)
    try {
      await api.delete(`/tasks/${selectedGen.id}`)
      setGenDeleteConfirm(false)
      setGenTasks(p => p.filter(t => t.id !== selectedGen.id))
      setSelectedGen(null)
      showToast('Task deleted')
    } catch { showToast('Failed to delete', false) }
    finally { setGenActLoading(false) }
  }


  // ── Filtered lists ──────────────────────────────────────────────────────────
  // Derive unique trainees from loaded pipeline tasks (for completed/incomplete filter)
  const completedTraineeOptions: { id: string; name: string }[] = []
  if (completedOnly || incompleteOnly) {
    const seen = new Set<string>()
    pipeTasks.forEach((t: any) => {
      if (t.trainee?.id && !seen.has(t.trainee.id)) {
        seen.add(t.trainee.id)
        completedTraineeOptions.push({ id: t.trainee.id, name: t.trainee.fullName ?? '' })
      }
    })
  }

  // Time range helper for completed filters
  const inTimeRange = (dateStr: string | undefined) => {
    if (!dateStr) return true
    const d = new Date(dateStr)
    if (filterTime === 'all') return true
    const now = new Date()
    if (filterTime === 'this_month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    if (filterTime === 'this_year')  return d.getFullYear() === now.getFullYear()
    if (filterTime === 'custom') {
      if (filterFrom && d < new Date(filterFrom)) return false
      if (filterTo   && d > new Date(filterTo + 'T23:59:59')) return false
    }
    return true
  }

  const filteredPipe = pipeTasks.filter(t => {
    const q = search.toLowerCase()
    const matchSearch = !search || t.client?.user?.fullName?.toLowerCase().includes(q) || t.client?.businessName?.toLowerCase().includes(q) || t.client?.user?.userCode?.toLowerCase().includes(q)
    if (!matchSearch) return false
    if (completedOnly || incompleteOnly) {
      if (filterTrainee !== 'all' && t.trainee?.id !== filterTrainee) return false
      if (filterAuthority   !== 'all' && (t.authority   ?? 'FBR')      !== filterAuthority)   return false
      if (filterReturnType  !== 'all' && (t.returnType  ?? 'ORIGINAL') !== filterReturnType)  return false
      if (completedOnly && !inTimeRange(t.updatedAt)) return false
      if (incompleteOnly && filterStatus !== 'all') {
        const isToDo = t.status === 'DATA_COLLECTION'
        if (filterStatus === 'todo' && !isToDo) return false
        if (filterStatus === 'inprogress' && isToDo) return false
      }
    }
    return true
  })
  const filteredGen = genTasks.filter(t => {
    if (!completedOnly && !incompleteOnly && t.status === 'DONE') return false
    const q = search.toLowerCase()
    const matchSearch = !search || t.title?.toLowerCase().includes(q) || t.client?.businessName?.toLowerCase().includes(q) || t.assignedTo?.fullName?.toLowerCase().includes(q)
    if (!matchSearch) return false
    return true
  })
  const filteredFbr = fbrCases.filter(c => {
    // In normal view: hide closed cases (they live in Completed Tasks)
    if (!completedOnly && !incompleteOnly && c.currentStage === 'CLOSED') return false
    const q = search.toLowerCase()
    if (!search) return true
    return c.caseNumber?.toLowerCase().includes(q) ||
      c.client?.businessName?.toLowerCase().includes(q) ||
      c.client?.user?.fullName?.toLowerCase().includes(q) ||
      c.taxType?.toLowerCase().includes(q)
  })

  // ── Pills row ───────────────────────────────────────────────────────────────
  const PillsRow = (
    <div style={{ flexShrink:0, overflow:'visible' }}>
      <div style={{ display:'flex', justifyContent:'center', padding:'14px 24px 8px', background:'#f7f8fa', overflow:'visible' }}>
        <div style={{ display:'flex', gap:2, background:'#fff', border:`1px solid ${P.border}`, borderRadius:8, padding:3, overflow:'visible' }}>
          {TAX_TABS.map(tab => {
            const active = activeTax === tab.key
            const cnt    = tabCounts[tab.key] ?? 0
            return (
              <button key={tab.key}
                onClick={() => { setActiveTax(tab.key); sessionStorage.setItem(tabStorageKey, tab.key); if (tab.key === 'sales_tax' && (role === 'manager' || role === 'team_lead')) setManagerView(defaultManagerView) }}
                style={{ flexShrink:0, paddingTop:5, paddingBottom:5, paddingLeft:14, paddingRight: cnt > 0 ? 4 : 14, borderRadius:6, cursor:'pointer', fontFamily:"'Aptos',sans-serif", fontSize:12, fontWeight: active ? 700 : 500, transition:'all .15s', border:'none', background: active ? tab.color : 'transparent', color: active ? '#fff' : '#5C5C5C', whiteSpace:'nowrap', display:'flex', alignItems:'stretch', gap:5 }}
              >
                <span style={{ display:'flex', alignItems:'center' }}>{tab.label}</span>
                {cnt > 0 && (
                  <span style={{
                    background: active ? 'rgba(255,255,255,0.25)' : tab.color,
                    color: '#fff', fontSize:10, fontWeight:700,
                    padding:'0 6px', borderRadius:3, lineHeight:1,
                    display:'flex', alignItems:'center',
                  }}>{cnt > 99 ? '99+' : cnt}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ display:'flex', gap:3, padding:'0 20px', height:3, flexShrink:0 }}>
        {TAX_TABS.map(tab => (
          <div key={tab.key} style={{ flex:1, background:tab.color, borderRadius:2, opacity: activeTax === tab.key ? 1 : 0.35, transition:'opacity .2s' }} />
        ))}
      </div>
    </div>
  )

  // ── Pipeline detail (shared between right-panel and completedOnly modal) ─────
  const pipelineDetailContent: React.ReactNode = isPipelineView && selectedPipe ? (() => {
    const isSentBack  = selectedPipe.status === 'SENT_BACK'
    const isCompleted = selectedPipe.status === 'COMPLETED'
    const curStatus   = isSentBack ? 'INCHARGE_REVIEW' : selectedPipe.status

    // Completed tasks use the frozen snapshot; incomplete tasks use current config
    const taskSteps: StepDef[] = isCompleted && selectedPipe.stepsSnapshot
      ? (selectedPipe.stepsSnapshot as any[]).filter((s: any) => s.isActive !== false).map(toStepDef)
      : pipelineSteps
    const stepOrder = taskSteps.map(s => s.key)

    const curIdx = isCompleted ? stepOrder.length : stepOrder.indexOf(curStatus)

    // Returns { at: Date, by: string } for when a step was completed
    const stepCompletedInfo = (key: string): { at: Date; by: string } | null => {
      const nextKey = stepOrder[stepOrder.indexOf(key) + 1]
      const h = selectedPipe.history?.find((h: any) =>
        h.toStatus === nextKey || (nextKey === undefined && h.toStatus === 'COMPLETED')
      )
      if (!h) return null
      return { at: new Date(h.createdAt), by: h.actedBy?.fullName ?? '' }
    }

    const stepComment = (key: string) => {
      if (key === 'INCHARGE_REVIEW' && isSentBack && selectedPipe.managerComment) return selectedPipe.managerComment
      const nextKey = stepOrder[stepOrder.indexOf(key) + 1]
      const h = selectedPipe.history?.find((h:any) => h.toStatus === nextKey || (nextKey === undefined && h.toStatus === 'COMPLETED'))
      return h?.comment || ''
    }
    const stepAttachment = (key: string) => {
      if (key === 'CHALLAN_GENERATED' && selectedPipe.psid) return `PSID: ${selectedPipe.psid}${selectedPipe.challanAmount ? ` · Rs ${selectedPipe.challanAmount}` : ''}`
      if (key === 'FILED' && selectedPipe.feeInvoiceNo) return `Inv: ${selectedPipe.feeInvoiceNo}${selectedPipe.feeInvoiceAmount ? ` · Rs ${selectedPipe.feeInvoiceAmount}` : ''}`
      const nextKey = stepOrder[stepOrder.indexOf(key) + 1]
      const h = selectedPipe.history?.find((h:any) => h.toStatus === nextKey || (nextKey === undefined && h.toStatus === 'COMPLETED'))
      return h?.attachment || ''
    }
    const triggerStep = (key: string) => {
      if (key === 'INCHARGE_REVIEW')     return handleManagerApprove
      if (key === 'SUBMISSION_APPROVAL') return handleManagerApprove
      // FILED step on SALES_TAX / INCOME_TAX tasks must open the modal first (summary data required)
      if (key === 'FILED' && (selectedPipe.taskType === 'SALES_TAX' || selectedPipe.taskType === 'INCOME_TAX')) return () => setAdvanceModal(true)
      return handleAdvance
    }
    const F = "'Inter','DM Sans',-apple-system,sans-serif"
    const skippedKeys: string[] = selectedPipe.skippedSteps ?? []
    const activeSteps = taskSteps.filter(s => !skippedKeys.includes(s.key))
    const doneCount = isCompleted ? activeSteps.length : activeSteps.filter(s => stepOrder.indexOf(s.key) < curIdx).length
    const pctW = `${Math.round((doneCount / activeSteps.length) * 100)}%`

    return (
      <div style={{ fontFamily:F, minHeight:'100%' }}>

        {/* ── Header ── */}
        {(() => {
          const statusCfg = isCompleted
            ? { label:'Complete',    color:'#166534', bg:'#DCFCE7', dot:'#16a34a' }
            : doneCount === 0
            ? { label:'To Do',       color:'#374151', bg:'#F1F5F9', dot:'#94A3B8' }
            : { label:'In Progress', color:'#92400E', bg:'#FEF3C7', dot:'#F59E0B' }
          const priBg: Record<string,string> = { HIGH:'#FEE2E2', URGENT:'#FFE4E6', LOW:'#F0FDF4', MEDIUM:'#EFF6FF' }
          const priColor: Record<string,string> = { HIGH:'#DC2626', URGENT:'#BE123C', LOW:'#16a34a', MEDIUM:'#1D4ED8' }
          const pri = (selectedPipe.priority ?? 'MEDIUM') as string
          return (
            <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden', margin:'12px 16px 4px' }}>
              <div style={{ padding:'14px 16px 12px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                  <div style={{ width:42, height:42, borderRadius:10, background:NAVY, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#fff', fontSize:14, fontWeight:700, letterSpacing:'0.05em' }}>
                    {(selectedPipe.client?.businessName ?? selectedPipe.client?.user?.fullName ?? '').split(' ').slice(0,2).map((w:string)=>w[0]).join('').toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                      <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:NAVY, letterSpacing:'-0.02em', lineHeight:1.2 }}>
                        {selectedPipe.client?.businessName ?? selectedPipe.client?.user?.fullName}
                      </h2>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:600, color:statusCfg.color, background:statusCfg.bg, padding:'3px 10px', borderRadius:20 }}>
                          <span style={{ width:6, height:6, borderRadius:'50%', background:statusCfg.dot, flexShrink:0 }} />{statusCfg.label}
                        </span>
                        {!completedOnly && !incompleteOnly && (
                          <button onClick={() => { setSelectedPipe(null); setListCollapsed(false) }}
                            style={{ background:'#F1F5F9', border:'none', cursor:'pointer', color:'#64748B', width:24, height:24, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <svg width={10} height={10} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <p style={{ margin:'2px 0 0', fontSize:12, color:'#64748B' }}>{activeTab.label} Return</p>
                  </div>
                </div>
                <div style={{ height:1, background:'#F1F5F9', margin:'12px 0' }} />
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                  {[
                    { label: role === 'manager' && defaultManagerView === 'my' ? 'Manager' : role === 'team_lead' && defaultManagerView === 'my' ? 'Team Lead' : 'Trainee', val: selectedPipe.trainee?.fullName ?? '' },
                  ].map(({ label, val }) => (
                    <span key={label} style={{ fontSize:11, color:'#334155', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'3px 10px', borderRadius:6 }}>
                      <span style={{ color:'#94A3B8', fontWeight:600 }}>{label}: </span>{val}
                    </span>
                  ))}
                  {isSalesTaxTab && (() => { const auth = selectedPipe.authority ?? 'FBR'; const a = authorityStyle(auth); return <span style={{ fontSize:11, color:a.color, background:a.bg, border:`1px solid ${a.color}22`, padding:'3px 10px', borderRadius:6 }}><span style={{ color:'#94A3B8', fontWeight:600 }}>Authority: </span><span style={{ fontWeight:700 }}>{auth}</span></span> })()}
                  {(() => { const rt = returnTypeStyle(selectedPipe.returnType ?? 'ORIGINAL'); return <span style={{ fontSize:11, color:rt.color, background:rt.bg, border:`1px solid ${rt.color}22`, padding:'3px 10px', borderRadius:6 }}><span style={{ color:'#94A3B8', fontWeight:600 }}>Return: </span><span style={{ fontWeight:700 }}>{rt.label}</span></span> })()}
                  {[
                    { label:'Period',  val: periodLabel(selectedPipe.taskType, selectedPipe.periodMonth, selectedPipe.periodYear) },
                    { label:'Due',     val: selectedPipe.dueDate ? new Date(selectedPipe.dueDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : 'Not set' },
                  ].map(({ label, val }) => (
                    <span key={label} style={{ fontSize:11, color:'#334155', background:'#F0FAFB', border:'1px solid #A5F3FC', padding:'3px 10px', borderRadius:6 }}>
                      <span style={{ color:'#94A3B8', fontWeight:600 }}>{label}: </span>{val}
                    </span>
                  ))}
                  <span style={{ fontSize:11, color:priColor[pri]??'#1D4ED8', background:priBg[pri]??'#EFF6FF', border:`1px solid ${priColor[pri]??'#1D4ED8'}22`, padding:'3px 10px', borderRadius:6 }}>
                    <span style={{ color:'#94A3B8', fontWeight:600 }}>Priority: </span><span style={{ fontWeight:700 }}>{pri}</span>
                  </span>
                  {(role === 'trainee' || role === 'manager' || role === 'team_lead') && !isCompleted && (<>
                    <button onClick={() => { setAddStepModal({ open:true, insertAfter:'' }); setAddStepForm({ title:'', description:'', approvedBy: (role === 'manager' || role === 'team_lead') ? 'MANAGER' : 'TRAINEE' }) }}
                      title="Add custom step"
                      style={{ padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', border:`1.5px dashed ${TEAL}`, background:'#F0FAFB', color:TEAL, lineHeight:1 }}>
                      + Add Step
                    </button>
                    <button onClick={() => setDeleteStepModal(true)}
                      title="Delete / skip step"
                      style={{ padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px dashed #DC2626', background:'#FEF2F2', color:'#DC2626', lineHeight:1 }}>
                      − Delete Step
                    </button>
                  </>)}
                  {isCompleted && (<>
                    {canMarkIncomplete && (
                      <button onClick={() => setAdminRevertConfirm(true)}
                        style={{ padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', border:`1.5px dashed #D97706`, background:'#FFFBEB', color:'#D97706', lineHeight:1 }}>
                        ↩ Mark Incomplete
                      </button>
                    )}
                    {canDeleteTask && (
                      <button onClick={() => setAdminDeleteConfirm(true)}
                        style={{ padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px dashed #DC2626', background:'#FEF2F2', color:'#DC2626', lineHeight:1 }}>
                        🗑 Delete Task
                      </button>
                    )}
                  </>)}
                  {!isCompleted && canDeleteTask && (
                    <button onClick={() => setAdminDeleteConfirm(true)}
                      style={{ padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px dashed #DC2626', background:'#FEF2F2', color:'#DC2626', lineHeight:1 }}>
                      🗑 Delete Task
                    </button>
                  )}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ flex:1, height:6, background:'#E2E8F0', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:3, width:pctW, background:isCompleted?'#22C55E':TEAL, transition:'width .4s' }} />
                  </div>
                  <span style={{ fontSize:11, color:'#94A3B8', flexShrink:0, whiteSpace:'nowrap', fontWeight:500 }}>{doneCount} / {stepOrder.length} steps</span>
                </div>
              </div>
              {selectedPipe.assignerNote && (
                <div style={{ borderTop:'1px solid #F1F5F9', padding:'7px 16px', background:'#FAFBFF', display:'flex', gap:6 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:TEAL, flexShrink:0 }}>Note:</span>
                  <span style={{ fontSize:11, color:'#475569' }}>{selectedPipe.assignerNote}</span>
                </div>
              )}
            </div>
          )
        })()}

        {isSentBack && selectedPipe.managerComment && (
          <div style={{ background:'#FEF2F2', borderBottom:'1px solid #FECACA', padding:'8px 20px' }}>
            <span style={{ fontSize:11, fontWeight:700, color:'#B91C1C' }}>Sent Back: </span>
            <span style={{ fontSize:11, color:'#7F1D1D' }}>{selectedPipe.managerComment}</span>
          </div>
        )}

        {/* ── Steps ── */}
        <div style={{ padding:'6px 16px 16px' }}>
          {activeSteps.map((step, idx) => {
            const stepIdx       = stepOrder.indexOf(step.key)
            const isDone        = isCompleted || stepIdx < curIdx
            const isActive      = !isCompleted && stepIdx === curIdx
            const isSentBackRow = isSentBack && step.key === 'INCHARGE_REVIEW'
            const isTraineeStep = step.by === 'Trainee'
            const isManagerStep = step.by === 'Manager'
            const isSelfManaged = defaultManagerView === 'my' && (role === 'manager' || role === 'team_lead')
            const canActNow     = isActive && (
              defaultManagerView === 'my' ||
              (role === 'trainee' && isTraineeStep) ||
              ((role === 'manager' || role === 'team_lead') && isManagerStep) ||
              (role === 'trainee' && isSentBack && step.key === 'INCHARGE_REVIEW')
            )
            const awaitingOther = isActive && !canActNow && !isSentBackRow && !isSelfManaged
            const cmt = (isDone || isSentBackRow) ? stepComment(step.key) : null
            const att = isDone ? stepAttachment(step.key) : null
            const isLast = idx === taskSteps.length - 1
            const dotColor = isDone ? '#16a34a' : isSentBackRow ? '#dc2626' : isActive ? TEAL : '#CBD5E1'

            return (
              <React.Fragment key={step.key}>
              <div style={{ display:'flex', gap:0, position:'relative' }}>
                {!isLast && (
                  <div style={{ position:'absolute', left:13, top:32, bottom:0, width:1.5, background: isDone ? '#BBF7D0' : '#E2E8F0' }} />
                )}
                <div style={{ flexShrink:0, width:28, paddingTop:14, display:'flex', justifyContent:'center', zIndex:1 }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background: isDone ? '#16a34a' : isSentBackRow ? '#dc2626' : isActive ? TEAL : '#E2E8F0', display:'flex', alignItems:'center', justifyContent:'center', border: isDone || isActive || isSentBackRow ? 'none' : '1.5px solid #CBD5E1' }}>
                    <span style={{ fontSize:10, fontWeight:700, color: isDone || isActive || isSentBackRow ? '#fff' : '#94A3B8', lineHeight:1 }}>{idx + 1}</span>
                  </div>
                </div>
                <div style={{ flex:1, marginLeft:10, paddingBottom: isLast ? 0 : 12, paddingTop:8 }}>
                  <div style={{ background: isDone ? '#F0FDF4' : isActive ? '#fff' : '#FAFAFA', border:`1px solid ${isDone ? '#BBF7D0' : isActive ? (isSentBackRow ? '#FECACA' : '#BAE6FD') : '#E2E8F0'}`, borderRadius:8, padding:'10px 14px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ flex:1, fontSize:13, fontWeight: isActive ? 600 : isDone ? 400 : 500, color: isDone ? '#64748B' : NAVY, lineHeight:1.4 }}>{step.label}</span>
                      {!isSelfManaged && <span style={{ fontSize:10, fontWeight:600, color: isManagerStep ? NAVY : '#166534', background: isManagerStep ? '#EFF6FF' : '#F0FDF4', padding:'2px 8px', borderRadius:4, flexShrink:0 }}>{step.by}</span>}
                      {isDone && (() => {
                        const isLastDone = stepIdx === curIdx - 1 && role === 'trainee' && isTraineeStep && !isCompleted
                        const info = stepCompletedInfo(step.key)
                        return (
                          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                            <span style={{ fontSize:11, fontWeight:600, color:'#16a34a' }}>✓ Done</span>
                            {info && (
                              <span style={{ fontSize:10, color:'#64748B', background:'#F1F5F9', padding:'2px 7px', borderRadius:4, whiteSpace:'nowrap' }}>
                                {info.at.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} {info.at.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true})}
                              </span>
                            )}
                            {isLastDone && (
                              <button onClick={handleRevert} disabled={actionLoading}
                                style={{ padding:'3px 9px', borderRadius:5, fontSize:11, fontWeight:600, cursor:'pointer', background:'#F1F5F9', color:'#64748B', border:'1px solid #E2E8F0', opacity: actionLoading ? 0.5 : 1 }}>
                                Undo
                              </button>
                            )}
                          </div>
                        )
                      })()}
                      {isSentBackRow && <span style={{ fontSize:11, fontWeight:600, color:'#dc2626', flexShrink:0 }}>Returned</span>}
                      {isActive && !isSentBackRow && canActNow && (isTraineeStep || isSelfManaged) && !(isSelfManaged && isManagerStep) && (
                        <button onClick={triggerStep(step.key)} disabled={actionLoading}
                          style={{ flexShrink:0, padding:'5px 14px', borderRadius:6, fontSize:12, fontWeight:600, border:'none', cursor:'pointer', background:TEAL, color:'#fff', opacity: actionLoading ? 0.5 : 1 }}>
                          Mark Done
                        </button>
                      )}
                      {isActive && !isSentBackRow && canActNow && isManagerStep && isSelfManaged && (
                        <button onClick={handleManagerApprove} disabled={actionLoading}
                          style={{ flexShrink:0, padding:'5px 14px', borderRadius:6, fontSize:12, fontWeight:600, border:'none', cursor:'pointer', background:TEAL, color:'#fff', opacity: actionLoading ? 0.5 : 1 }}>
                          Mark Done
                        </button>
                      )}
                      {isActive && !isSentBackRow && canActNow && isManagerStep && !isSelfManaged && (
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          <button onClick={handleManagerApprove} disabled={actionLoading}
                            style={{ padding:'5px 12px', borderRadius:6, fontSize:12, fontWeight:600, border:'none', cursor:'pointer', background:'#16a34a', color:'#fff', opacity: actionLoading ? 0.5 : 1 }}>
                            Approve
                          </button>
                          <button onClick={() => setSendBackModal(true)} disabled={actionLoading}
                            style={{ padding:'5px 12px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', background:'#FEF2F2', color:'#dc2626', border:'1px solid #FECACA', opacity: actionLoading ? 0.5 : 1 }}>
                            Send Back
                          </button>
                        </div>
                      )}
                      {awaitingOther && isManagerStep && (
                        <span style={{ fontSize:11, fontWeight:600, color:'#92400E', background:'#FEF3C7', padding:'2px 8px', borderRadius:4, flexShrink:0 }}>With Manager</span>
                      )}
                      {awaitingOther && isTraineeStep && (
                        <span style={{ fontSize:11, fontWeight:600, color:'#0E7490', background:'#ECFEFF', padding:'2px 8px', borderRadius:4, flexShrink:0 }}>With Trainee</span>
                      )}
                      {isSentBackRow && role === 'trainee' && (
                        <button onClick={() => setAdvanceModal(true)} disabled={actionLoading}
                          style={{ flexShrink:0, padding:'5px 12px', borderRadius:6, fontSize:12, fontWeight:600, border:'none', cursor:'pointer', background:TEAL, color:'#fff', opacity: actionLoading ? 0.5 : 1 }}>
                          Re-submit
                        </button>
                      )}
                    </div>
                    {isActive && canActNow && (isTraineeStep || isSelfManaged) && (
                      <div style={{ display:'grid', gridTemplateColumns:'3fr 1fr', gap:8, marginTop:10, paddingTop:10, borderTop:'1px solid #E2E8F0' }}>
                        <div>
                          <label style={{ display:'block', fontSize:10, fontWeight:600, color:'#64748B', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Comment</label>
                          <textarea value={advanceForm.comment ?? ''} onChange={e => setAdvanceForm(p => ({...p, comment: e.target.value}))}
                            placeholder="Optional note..." rows={2}
                            style={{ width:'100%', boxSizing:'border-box', padding:'6px 9px', borderRadius:6, border:'1px solid #E2E8F0', fontSize:12, outline:'none', resize:'none', color:NAVY, fontFamily:F, height:60 }} />
                        </div>
                        <div>
                          <label style={{ display:'block', fontSize:10, fontWeight:600, color:'#64748B', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Attachment</label>
                          {advanceForm.attachment ? (
                            <div style={{ display:'flex', alignItems:'center', gap:4, padding:'0 8px', borderRadius:6, border:'1px solid #BBF7D0', background:'#F0FDF4', fontSize:11, height:60, boxSizing:'border-box' }}>
                              <span style={{ flex:1, color:'#166534', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:10 }}>{advanceForm.attachment.split('/').pop()}</span>
                              <button onClick={() => setAdvanceForm(p => ({...p, attachment: ''}))}
                                style={{ flexShrink:0, background:'none', border:'none', cursor:'pointer', color:'#94A3B8', padding:0, fontSize:13, lineHeight:1 }}>x</button>
                            </div>
                          ) : (
                            <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, borderRadius:6, border:'1px dashed #CBD5E1', cursor:'pointer', fontSize:11, color:'#94A3B8', background:'#FAFAFA', height:60, boxSizing:'border-box' }}>
                              <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                              Upload
                              <input type="file" accept="image/*,.pdf,.xlsx,.xls,.doc,.docx" style={{ display:'none' }}
                                onChange={async e => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  const fd = new FormData()
                                  fd.append('file', file)
                                  try {
                                    const { default: api } = await import('../../lib/api')
                                    const res = await api.post('/sales-tax-tasks/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                                    const url = res.data?.data?.url ?? res.data?.url
                                    setAdvanceForm(p => ({...p, attachment: url}))
                                  } catch { /* silent */ }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    )}
                    {(isDone || isSentBackRow) && (!!cmt || !!att) && (
                      <div style={{ display:'flex', gap:14, marginTop:8, paddingTop:8, borderTop:'1px solid #E2E8F0', flexWrap:'wrap' }}>
                        {!!cmt && <span style={{ fontSize:11, color:'#475569' }}><span style={{ fontWeight:600, color:'#94A3B8' }}>Note: </span>{cmt}</span>}
                        {!!att && (
                          att.startsWith('/uploads') ? (
                            <a href={`http://localhost:4000${att}`} target="_blank" rel="noreferrer"
                              style={{ fontSize:11, color:TEAL, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4 }}>
                              <svg width={11} height={11} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                              {att.split('/').pop()}
                            </a>
                          ) : (
                            <span style={{ fontSize:11, color:'#475569' }}><span style={{ fontWeight:600, color:'#94A3B8' }}>File: </span>{att}</span>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {(selectedPipe.customSteps ?? []).filter((cs:any) => cs.insertAfter === step.key).map((cs:any) => (
                <div key={cs.id} style={{ display:'flex', gap:0, position:'relative' }}>
                  <div style={{ position:'absolute', left:13, top:0, bottom:0, width:1.5, background:'#FDE68A' }} />
                  <div style={{ flexShrink:0, width:28, paddingTop:8, display:'flex', justifyContent:'center', zIndex:1 }}>
                    <div style={{ width:20, height:20, borderRadius:'50%', background: cs.isCompleted ? '#16a34a' : '#F59E0B', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'#fff' }}>+</span>
                    </div>
                  </div>
                  <div style={{ flex:1, marginLeft:10, paddingBottom:10, paddingTop:4 }}>
                    <div style={{ background: cs.isCompleted ? '#F0FDF4' : '#FFFBEB', border:`1px solid ${cs.isCompleted ? '#BBF7D0' : '#FDE68A'}`, borderRadius:8, padding:'8px 12px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span style={{ flex:1, fontSize:13, fontWeight:500, color: cs.isCompleted ? '#64748B' : NAVY }}>{cs.title}</span>
                        <span style={{ fontSize:10, fontWeight:600, color: cs.approvedBy === 'MANAGER' ? NAVY : '#166534', background: cs.approvedBy === 'MANAGER' ? '#EFF6FF' : '#F0FDF4', padding:'2px 7px', borderRadius:4 }}>
                          {cs.approvedBy === 'MANAGER' ? 'Manager' : 'Trainee'}
                        </span>
                        {cs.isCompleted && <span style={{ fontSize:11, fontWeight:600, color:'#16a34a' }}>Done</span>}
                        {!cs.isCompleted && (
                          <>
                            {((cs.approvedBy === 'TRAINEE' && role === 'trainee') || (cs.approvedBy === 'MANAGER' && (role === 'manager' || role === 'team_lead'))) && (
                              <button onClick={() => handleCompleteCustomStep(cs.id)} disabled={customStepLoading}
                                style={{ padding:'3px 10px', borderRadius:5, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', background:TEAL, color:'#fff', opacity: customStepLoading ? 0.5 : 1 }}>
                                Mark Done
                              </button>
                            )}
                            {role === 'trainee' && cs.approvedBy === 'TRAINEE' && (
                              <button onClick={() => handleDeleteCustomStep(cs.id)} disabled={customStepLoading}
                                style={{ padding:'3px 8px', borderRadius:5, fontSize:11, fontWeight:600, cursor:'pointer', background:'#FEF2F2', color:'#dc2626', border:'1px solid #FECACA', opacity: customStepLoading ? 0.5 : 1 }}>
                                Delete
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {cs.description && <p style={{ margin:'5px 0 0', fontSize:11, color:'#64748B', lineHeight:1.5 }}>{cs.description}</p>}
                    </div>
                  </div>
                </div>
              ))}
              </React.Fragment>
            )
          })}
        </div>
      </div>
    )
  })() : null

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:P.bgMain, fontFamily:"'Aptos',sans-serif" }}>

      {toast && (
        <div style={{ position:'fixed', top:20, right:24, zIndex:9999, background: toast.ok ? '#3A6B3A' : '#D62828', color:'#fff', padding:'10px 20px', borderRadius:10, fontSize:13, fontWeight:600, fontFamily:"'Aptos',sans-serif", boxShadow:'0 4px 16px rgba(0,0,0,0.15)' }}>{toast.msg}</div>
      )}

      {/* ── completedOnly: full-width table layout ── */}
      {(completedOnly || incompleteOnly) && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Header + tax pills on same row */}
          <div style={{ background:'#EDF0F3', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 20px 8px', gap:12 }}>
              <h2 style={{ margin:0, fontSize:22, fontFamily:"'Angelos', sans-serif", color:NAVY, flexShrink:0, display:'inline-block', transform:'skewX(12deg)' }}>{incompleteOnly ? 'Incomplete Tasks' : 'Completed Tasks'}</h2>
              <div style={{ display:'flex', gap:2, background:'#fff', border:`1px solid ${P.border}`, borderRadius:8, padding:3, flexShrink:0 }}>
                {TAX_TABS.map(tab => {
                  const isActive = activeTax === tab.key
                  return (
                    <button key={tab.key} onClick={() => { setActiveTax(tab.key); sessionStorage.setItem(tabStorageKey, tab.key) }}
                      style={{ flexShrink:0, padding:'5px 14px', borderRadius:6, cursor:'pointer', fontFamily:"'Aptos',sans-serif", fontSize:12, fontWeight: isActive ? 700 : 500, transition:'all .15s', border:'none', background: isActive ? tab.color : 'transparent', color: isActive ? '#fff' : '#5C5C5C', whiteSpace:'nowrap' }}>
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div style={{ display:'flex', gap:3, padding:'0 20px', height:3, flexShrink:0 }}>
              {TAX_TABS.map(tab => (
                <div key={tab.key} style={{ flex:1, background:tab.color, borderRadius:2, opacity: activeTax === tab.key ? 1 : 0.35, transition:'opacity .2s' }} />
              ))}
            </div>
          </div>

          {/* Filter bar */}
          <div style={{ background:'#EDF0F3', flexShrink:0, padding:'10px 16px', borderBottom:`1px solid ${P.border}` }}>

            {/* Single pill bar */}
            <div style={{ display:'flex', alignItems:'center', gap:6, background:TEAL, borderRadius:40, padding:'5px 8px' }}>

              {/* Trainee dropdown */}
              <select value={filterTrainee} onChange={e => setFilterTrainee(e.target.value)}
                style={{ flexShrink:0, padding:'4px 10px', borderRadius:30, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'"Aptos",sans-serif', background: filterTrainee !== 'all' ? NAVY : 'rgba(255,255,255,0.18)', color:'#fff', outline:'none', appearance:'none', paddingRight:24, backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center' }}>
                <option value="all" style={{ background:NAVY }}>All Trainees</option>
                {completedTraineeOptions.map(tr => (
                  <option key={tr.id} value={tr.id} style={{ background:NAVY }}>{tr.name}</option>
                ))}
              </select>

              {/* Separator */}
              <div style={{ width:1, height:22, background:'rgba(255,255,255,0.3)', flexShrink:0, margin:'0 2px' }} />

              {/* Authority dropdown — Sales Tax only */}
              {isSalesTaxTab && (
                <select value={filterAuthority} onChange={e => setFilterAuthority(e.target.value)}
                  style={{ flexShrink:0, padding:'4px 10px', borderRadius:30, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'"Aptos",sans-serif', background: filterAuthority !== 'all' ? NAVY : 'rgba(255,255,255,0.18)', color:'#fff', outline:'none', appearance:'none', paddingRight:24, backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center' }}>
                  <option value="all" style={{ background:NAVY }}>All Authorities</option>
                  {TAX_AUTHORITIES.map(a => (
                    <option key={a.key} value={a.key} style={{ background:NAVY }}>{a.label}</option>
                  ))}
                </select>
              )}

              {/* Return Type dropdown */}
              <select value={filterReturnType} onChange={e => setFilterReturnType(e.target.value)}
                style={{ flexShrink:0, padding:'4px 10px', borderRadius:30, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'"Aptos",sans-serif', background: filterReturnType !== 'all' ? NAVY : 'rgba(255,255,255,0.18)', color:'#fff', outline:'none', appearance:'none', paddingRight:24, backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center' }}>
                <option value="all" style={{ background:NAVY }}>All Types</option>
                {RETURN_TYPES.map(r => (
                  <option key={r.key} value={r.key} style={{ background:NAVY }}>{r.label}</option>
                ))}
              </select>

              {/* Status filter — incompleteOnly only */}
              {incompleteOnly && (
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  style={{ flexShrink:0, padding:'4px 10px', borderRadius:30, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'"Aptos",sans-serif', background: filterStatus !== 'all' ? NAVY : 'rgba(255,255,255,0.18)', color:'#fff', outline:'none', appearance:'none', paddingRight:24, backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center' }}>
                  <option value="all" style={{ background:NAVY }}>All Status</option>
                  <option value="todo" style={{ background:NAVY }}>To Do</option>
                  <option value="inprogress" style={{ background:NAVY }}>In Progress</option>
                </select>
              )}

              {/* Separator */}
              <div style={{ width:1, height:22, background:'rgba(255,255,255,0.3)', flexShrink:0, margin:'0 2px' }} />

              {/* Time pills */}
              {([['all','All'],['this_month','This Month'],['this_year','This Year'],['custom','Custom']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setFilterTime(key)}
                  style={{ flexShrink:0, padding:'4px 12px', borderRadius:40, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'"Aptos",sans-serif', transition:'all .15s', whiteSpace:'nowrap',
                    background: filterTime === key ? NAVY : 'transparent',
                    color: filterTime === key ? '#fff' : 'rgba(255,255,255,0.85)' }}>
                  {label}
                </button>
              ))}

              {/* Separator */}
              <div style={{ width:1, height:22, background:'rgba(255,255,255,0.3)', flexShrink:0, margin:'0 2px' }} />

              {/* Search — fixed small width */}
              <div style={{ position:'relative', width:220, flexShrink:0 }}>
                <svg style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.8)" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="completed-search"
                  style={{ width:'100%', boxSizing:'border-box', paddingLeft:28, paddingRight:8, paddingTop:4, paddingBottom:4, borderRadius:30, border:'1.5px solid rgba(255,255,255,0.35)', fontSize:12, outline:'none', background:'rgba(255,255,255,0.15)', color:'#fff' }} />
              </div>

              {/* Count */}
              <span style={{ flexShrink:0, fontSize:13, fontWeight:700, color:'#fff', whiteSpace:'nowrap', paddingLeft:4, paddingRight:4 }}>
                {isFbrView
                  ? filteredFbr.filter(c => incompleteOnly ? c.currentStage !== 'CLOSED' : c.currentStage === 'CLOSED').length
                  : isPipelineView
                  ? filteredPipe.filter(t => incompleteOnly ? t.status !== 'COMPLETED' : t.status === 'COMPLETED').length
                  : filteredGen.filter(t => incompleteOnly ? t.status !== 'DONE' : t.status === 'DONE').length
                } {isFbrView ? 'cases' : 'tasks'}
              </span>

            </div>

            {/* Custom date range (below the pill bar) */}
            {filterTime === 'custom' && (
              <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:8, paddingLeft:4 }}>
                <span style={{ fontSize:11, fontWeight:600, color:'#64748B' }}>From:</span>
                <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                  style={{ padding:'4px 10px', borderRadius:8, border:`1px solid ${P.border}`, background:'#fff', color:NAVY, fontSize:12, outline:'none' }} />
                <span style={{ fontSize:11, fontWeight:600, color:'#64748B' }}>To:</span>
                <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                  style={{ padding:'4px 10px', borderRadius:8, border:`1px solid ${P.border}`, background:'#fff', color:NAVY, fontSize:12, outline:'none' }} />
                <button onClick={() => { setFilterFrom(''); setFilterTo('') }}
                  style={{ padding:'4px 12px', borderRadius:8, border:`1px solid ${P.border}`, background:'#fff', color:'#64748B', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                  Clear
                </button>
              </div>
            )}

          </div>

          {/* Table */}
          <div style={{ flex:1, overflowY:'auto', padding:'8px 20px 16px' }}>
            {(pipeLoading || genLoading || fbrLoading) && <div style={{ padding:32, textAlign:'center', color:P.textMuted, fontSize:13 }}>Loading…</div>}

            {!pipeLoading && !genLoading && !fbrLoading && (
              <div style={{ background:'#fff', borderRadius:12, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>

                {/* Header row */}
                {(() => {
                  if (isFbrView) {
                    const hdrs = ['#', 'Client', 'Section', 'Tax Type', 'Tax Year', 'Stage', incompleteOnly ? 'Status' : 'Closed On', '']
                    return (
                      <div style={{ display:'grid', gridTemplateColumns:'40px 1fr 130px 120px 90px 120px 150px 75px', background:'#F2AC18', padding:'7px 18px', alignItems:'center' }}>
                        {hdrs.map(h => (
                          <span key={h} style={{ fontSize:12, fontWeight:600, color:'#1a1a1a', textTransform:'uppercase', letterSpacing:'0.07em', fontFamily:'"Aptos", sans-serif' }}>{h}</span>
                        ))}
                      </div>
                    )
                  }
                  if (isGenView) {
                    const hdrs = ['#', 'Task', 'Assigned To', 'Client', 'Due Date', incompleteOnly ? 'Status' : 'Completed On', '']
                    return (
                      <div style={{ display:'grid', gridTemplateColumns:'40px 1fr 160px 130px 120px 150px 75px', background:'#374151', padding:'7px 18px', alignItems:'center' }}>
                        {hdrs.map(h => (
                          <span key={h} style={{ fontSize:12, fontWeight:600, color:'#fff', textTransform:'uppercase', letterSpacing:'0.07em', fontFamily:'"Aptos", sans-serif' }}>{h}</span>
                        ))}
                      </div>
                    )
                  }
                  const cols = isSalesTaxTab
                    ? '40px 1fr 110px 140px 120px 90px 110px 150px 75px'
                    : '40px 1fr 140px 120px 90px 110px 150px 75px'
                  const hdrs = isSalesTaxTab
                    ? ['#', 'Task', 'Authority', 'Return Type', 'Trainee', 'Period', 'Due Date', incompleteOnly ? 'Status' : 'Completed On', '']
                    : ['#', 'Task', 'Return Type', 'Trainee', 'Period', 'Due Date', incompleteOnly ? 'Status' : 'Completed On', '']
                  return (
                    <div style={{ display:'grid', gridTemplateColumns:cols, background:'#F2AC18', padding:'7px 18px', alignItems:'center' }}>
                      {hdrs.map(h => (
                        <span key={h} style={{ fontSize:12, fontWeight:600, color:'#1a1a1a', textTransform:'uppercase', letterSpacing:'0.07em', fontFamily:'"Aptos", sans-serif' }}>{h}</span>
                      ))}
                    </div>
                  )
                })()}

                {/* FBR case rows */}
                {isFbrView && (() => {
                  const rows = incompleteOnly
                    ? filteredFbr.filter(c => c.currentStage !== 'CLOSED')
                    : filteredFbr.filter(c => c.currentStage === 'CLOSED')
                  const emptyLabel = incompleteOnly ? 'No active Notices & Appeals cases.' : 'No closed Notices & Appeals cases yet.'
                  if (rows.length === 0) return <div style={{ padding:32, textAlign:'center', color:P.textMuted, fontSize:13 }}>{emptyLabel}</div>
                  return rows.map((c, idx) => {
                    const clientName = c.client?.businessName ?? c.client?.user?.fullName ?? 'N/A'
                    const stage = (() => {
                      const s = c.currentStage as string
                      if (s === 'CLOSED')       return { label: 'Closed',       color: '#065F46', bg: '#D1FAE5' }
                      if (s === 'HIGHER_FORUM') return { label: 'Higher Forum', color: '#991B1B', bg: '#FEE2E2' }
                      if (s === 'STAY')         return { label: 'Stay',          color: '#92400E', bg: '#FEF3C7' }
                      if (s === 'APPEAL')       return { label: 'Appeal',        color: '#5B21B6', bg: '#EDE9FE' }
                      return                           { label: 'Notice',        color: '#1E40AF', bg: '#DBEAFE' }
                    })()
                    const closedStr = c.closedAt
                      ? new Date(c.closedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})
                      : 'N/A'
                    return (
                      <div key={c.id} style={{ display:'grid', gridTemplateColumns:'40px 1fr 130px 120px 90px 120px 150px 75px', padding:'6px 18px', borderBottom:'1px solid #F1F5F9', alignItems:'center', background:'#fff', transition:'background .15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background='#F8FAFC' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background='#fff' }}>
                        <span style={{ fontSize:12, fontWeight:700, color:NAVY }}>{idx + 1}</span>
                        <span style={{ fontSize:13, fontWeight:700, color:NAVY, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:12 }}>{clientName}</span>
                        <span style={{ fontSize:11, fontWeight:700, color:'#7B2D8E', background:'#F3E8F7', padding:'2px 8px', borderRadius:5, width:'fit-content' }}>{c.noticeSection || 'N/A'}</span>
                        <span style={{ fontSize:12, color:'#475569' }}>{c.taxType?.replace(/_/g,' ')}</span>
                        <span style={{ fontSize:12, color:'#475569' }}>{c.taxYear || 'N/A'}</span>
                        <span style={{ fontSize:11, fontWeight:700, color: stage.color, background: stage.bg, padding:'2px 8px', borderRadius:5, width:'fit-content' }}>{stage.label}</span>
                        {incompleteOnly
                          ? <span style={{ fontSize:11, fontWeight:700, color:'#1565C0', background:'#E3F0FB', padding:'2px 8px', borderRadius:5, width:'fit-content' }}>Active</span>
                          : <span style={{ fontSize:11, color:'#16a34a', fontWeight:600 }}>{closedStr}</span>
                        }
                        <button onClick={() => setSelectedFbr(c)}
                          style={{ padding:'5px 14px', borderRadius:7, border:'1.5px solid #1565C0', background:'#E3F0FB', color:'#1565C0', fontSize:12, fontWeight:700, cursor:'pointer', width:'fit-content' }}>
                          View
                        </button>
                      </div>
                    )
                  })
                })()}

                {/* Pipeline task rows */}
                {isPipelineView && (() => {
                  const rows = filteredPipe.filter(t => incompleteOnly ? t.status !== 'COMPLETED' : t.status === 'COMPLETED')
                  const emptyLabel = incompleteOnly ? `No incomplete ${activeTab.label} tasks.` : `No completed ${activeTab.label} tasks yet.`
                  if (rows.length === 0) return <div style={{ padding:32, textAlign:'center', color:P.textMuted, fontSize:13 }}>{emptyLabel}</div>
                  const cols = isSalesTaxTab
                    ? '40px 1fr 110px 140px 120px 90px 110px 150px 75px'
                    : '40px 1fr 140px 120px 90px 110px 150px 75px'
                  return rows.map((t, idx) => {
                    const clientName = t.client?.businessName ?? t.client?.user?.fullName ?? 'N/A'
                    const dueStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : 'N/A'
                    const completionH = t.history?.find((h: any) => h.toStatus === 'COMPLETED')
                    const completedAt = completionH ? new Date(completionH.createdAt) : null
                    const completedStr = completedAt
                      ? `${completedAt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} ${completedAt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true})}`
                      : 'N/A'
                    const isSelected = selectedPipe?.id === t.id
                    const auth = authorityStyle(t.authority ?? 'FBR')
                    return (
                      <div key={t.id} style={{ display:'grid', gridTemplateColumns:cols, padding:'6px 18px', borderBottom:'1px solid #F1F5F9', alignItems:'center', background: isSelected ? '#EBF4FF' : '#fff', transition:'background .15s', cursor:'default' }}
                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background='#F8FAFC' }}
                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background='#fff' }}>
                        <span style={{ fontSize:12, fontWeight:700, color:NAVY }}>{idx + 1}</span>
                        <span style={{ fontSize:13, fontWeight:700, color:NAVY, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:12 }}>{clientName}</span>
                        {isSalesTaxTab && <span style={{ fontSize:11, fontWeight:700, color:auth.color, background:auth.bg, padding:'2px 8px', borderRadius:5, width:'fit-content' }}>{t.authority ?? 'FBR'}</span>}
                        {(() => { const rt = returnTypeStyle(t.returnType ?? 'ORIGINAL'); return <span style={{ fontSize:11, fontWeight:700, color:rt.color, background:rt.bg, padding:'2px 8px', borderRadius:5, width:'fit-content' }}>{rt.label}</span> })()}
                        <span style={{ fontSize:12, color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.trainee?.fullName ?? 'N/A'}</span>
                        <span style={{ fontSize:12, color:'#475569' }}>{periodLabel(t.taskType, t.periodMonth, t.periodYear)}</span>
                        <span style={{ fontSize:12, color:'#475569' }}>{dueStr}</span>
                        {incompleteOnly
                          ? (() => {
                              const isToDo = t.status === 'DATA_COLLECTION'
                              return <span style={{ fontSize:11, fontWeight:700, color:'#fff', background: isToDo ? '#DC2626' : '#F97316', padding:'2px 8px', borderRadius:5, width:'fit-content' }}>{isToDo ? 'To Do' : 'In Progress'}</span>
                            })()
                          : <span style={{ fontSize:11, color:'#16a34a', fontWeight:600 }}>{completedStr}</span>
                        }
                        <button onClick={() => { setSelectedPipe(t); setAdvanceForm({}) }}
                          style={{ padding:'5px 14px', borderRadius:7, border:`1.5px solid ${TEAL}`, background:'#F0FAFB', color:TEAL, fontSize:12, fontWeight:700, cursor:'pointer', width:'fit-content' }}>
                          View
                        </button>
                      </div>
                    )
                  })
                })()}

                {/* General task rows */}
                {isGenView && (() => {
                  const rows = incompleteOnly
                    ? filteredGen.filter(t => t.status !== 'DONE')
                    : filteredGen.filter(t => t.status === 'DONE')
                  const emptyLabel = incompleteOnly ? 'No incomplete General Tasks.' : 'No completed General Tasks yet.'
                  if (rows.length === 0) return <div style={{ padding:32, textAlign:'center', color:P.textMuted, fontSize:13 }}>{emptyLabel}</div>
                  return rows.map((t: any, idx: number) => {
                    const clientName = t.client?.businessName ?? t.client?.user?.fullName ?? 'N/A'
                    const dueStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : 'N/A'
                    const updAt = t.updatedAt ? new Date(t.updatedAt) : null
                    const completedStr = updAt
                      ? `${updAt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} ${updAt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true})}`
                      : 'N/A'
                    const sm = GEN_STATUS[t.status] ?? { label: t.status, color: NAVY, bg: '#eee' }
                    const isSelected = selectedGen?.id === t.id
                    return (
                      <div key={t.id} style={{ display:'grid', gridTemplateColumns:'40px 1fr 160px 130px 120px 150px 75px', padding:'6px 18px', borderBottom:'1px solid #F1F5F9', alignItems:'center', background: isSelected ? '#EBF4FF' : '#fff', transition:'background .15s', cursor:'default' }}
                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background='#F8FAFC' }}
                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background='#fff' }}>
                        <span style={{ fontSize:12, fontWeight:700, color:NAVY }}>{idx + 1}</span>
                        <span style={{ fontSize:13, fontWeight:700, color:NAVY, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:12 }}>{t.title}</span>
                        <span style={{ fontSize:12, color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.assignedTo?.fullName ?? 'N/A'}</span>
                        <span style={{ fontSize:12, color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{clientName}</span>
                        <span style={{ fontSize:12, color:'#475569' }}>{dueStr}</span>
                        {incompleteOnly
                          ? <span style={{ fontSize:11, fontWeight:700, color:sm.color, background:sm.bg, padding:'2px 8px', borderRadius:5, width:'fit-content' }}>{sm.label}</span>
                          : <span style={{ fontSize:11, color:'#16a34a', fontWeight:600 }}>{completedStr}</span>
                        }
                        <button onClick={() => setSelectedGen(t)}
                          style={{ padding:'5px 14px', borderRadius:7, border:'1.5px solid #374151', background:'#F3F4F6', color:'#374151', fontSize:12, fontWeight:700, cursor:'pointer', width:'fit-content' }}>
                          View
                        </button>
                      </div>
                    )
                  })
                })()}

              </div>
            )}
          </div>
        </div>
      )}

      {/* view modal (completedOnly / incompleteOnly) */}
      {(completedOnly || incompleteOnly) && selectedPipe && (
        <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ width:'min(960px,95vw)', height:'90vh', background:'#f7f8fa', borderRadius:16, overflow:'hidden', display:'flex', flexDirection:'column', position:'relative', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <button onClick={() => setSelectedPipe(null)}
              style={{ position:'absolute', top:12, right:12, zIndex:10, width:30, height:30, borderRadius:8, border:'none', cursor:'pointer', background:'#F1F5F9', color:'#64748B', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.1)' }}>
              <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div style={{ flex:1, overflowY:'auto' }}>
              {pipelineDetailContent}
            </div>
          </div>
        </div>
      )}

      {/* Gen task detail modal (completedOnly / incompleteOnly) */}
      {(completedOnly || incompleteOnly) && selectedGen && (() => {
        const F = "'Inter','DM Sans',-apple-system,sans-serif"
        const sm = GEN_STATUS[selectedGen.status] ?? { label: selectedGen.status, color: NAVY, bg: '#eee' }
        const isDone = selectedGen.status === 'DONE'
        const steps: any[] = selectedGen.steps ?? []
        const doneCount = steps.filter((s:any) => s.isDone).length
        const pctW = steps.length > 0 ? `${Math.round((doneCount / steps.length) * 100)}%` : '0%'
        const priColor: Record<string,string> = { HIGH:'#DC2626', URGENT:'#BE123C', LOW:'#16a34a', MEDIUM:'#1D4ED8' }
        const priBg:    Record<string,string> = { HIGH:'#FEE2E2', URGENT:'#FFE4E6', LOW:'#F0FDF4', MEDIUM:'#EFF6FF' }
        const pri = (selectedGen.priority ?? 'MEDIUM') as string
        return (
          <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div style={{ width:'min(720px,95vw)', height:'90vh', background:'#f7f8fa', borderRadius:16, overflow:'hidden', display:'flex', flexDirection:'column', position:'relative', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
              <button onClick={() => setSelectedGen(null)}
                style={{ position:'absolute', top:12, right:12, zIndex:10, width:30, height:30, borderRadius:8, border:'none', cursor:'pointer', background:'#F1F5F9', color:'#64748B', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.1)' }}>
                <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div style={{ flex:1, overflowY:'auto', fontFamily:F }}>
                <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden', margin:'12px 16px 4px' }}>
                  <div style={{ padding:'14px 16px 12px' }}>
                    <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                      <div style={{ width:42, height:42, borderRadius:10, background:'#374151', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#fff', fontSize:14, fontWeight:700 }}>
                        {selectedGen.title.split(' ').slice(0,2).map((w:string)=>w[0]).join('').toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                          <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:NAVY, letterSpacing:'-0.02em', lineHeight:1.2, fontFamily:F }}>{selectedGen.title}</h2>
                          <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:600, color:sm.color, background:sm.bg, padding:'3px 10px', borderRadius:20, flexShrink:0, marginRight:36 }}>
                            <span style={{ width:6, height:6, borderRadius:'50%', background:sm.color }} />{sm.label}
                          </span>
                        </div>
                        <p style={{ margin:'2px 0 0', fontSize:12, color:'#64748B', fontFamily:F }}>General Task</p>
                      </div>
                    </div>
                    <div style={{ height:1, background:'#F1F5F9', margin:'12px 0' }} />
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                      {selectedGen.assignedTo?.fullName && (
                        <span style={{ fontSize:11, color:'#334155', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'3px 10px', borderRadius:6 }}>
                          <span style={{ color:'#94A3B8', fontWeight:600 }}>Assigned: </span>{selectedGen.assignedTo.fullName}
                        </span>
                      )}
                      {selectedGen.client && (
                        <span style={{ fontSize:11, color:'#334155', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'3px 10px', borderRadius:6 }}>
                          <span style={{ color:'#94A3B8', fontWeight:600 }}>Client: </span>{selectedGen.client.businessName ?? selectedGen.client.user?.fullName}
                        </span>
                      )}
                      {selectedGen.dueDate && (
                        <span style={{ fontSize:11, color:'#334155', background:'#F0FAFB', border:'1px solid #A5F3FC', padding:'3px 10px', borderRadius:6 }}>
                          <span style={{ color:'#94A3B8', fontWeight:600 }}>Due: </span>{new Date(selectedGen.dueDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}
                        </span>
                      )}
                      <span style={{ fontSize:11, color:priColor[pri]??'#1D4ED8', background:priBg[pri]??'#EFF6FF', border:`1px solid ${priColor[pri]??'#1D4ED8'}22`, padding:'3px 10px', borderRadius:6 }}>
                        <span style={{ color:'#94A3B8', fontWeight:600 }}>Priority: </span><span style={{ fontWeight:700 }}>{pri}</span>
                      </span>
                      {!isDone && (
                        <button onClick={() => handleGenStatus('DONE')} disabled={genActLoading}
                          style={{ padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px solid #16a34a', background:'#F0FDF4', color:'#16a34a', lineHeight:1 }}>
                          ✓ Mark Complete
                        </button>
                      )}
                      {isDone && canMarkIncomplete && (
                        <button onClick={() => handleGenStatus('IN_PROGRESS')} disabled={genActLoading}
                          style={{ padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px dashed #D97706', background:'#FFFBEB', color:'#D97706', lineHeight:1 }}>
                          ↩ Mark Incomplete
                        </button>
                      )}
                      {canDeleteTask && (
                        <button onClick={() => setGenDeleteConfirm(true)}
                          style={{ padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px dashed #DC2626', background:'#FEF2F2', color:'#DC2626', lineHeight:1 }}>
                          🗑 Delete Task
                        </button>
                      )}
                    </div>
                    {steps.length > 0 && (
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ flex:1, height:6, background:'#E2E8F0', borderRadius:3, overflow:'hidden' }}>
                          <div style={{ height:'100%', borderRadius:3, width:pctW, background: isDone ? '#22C55E' : TEAL, transition:'width .4s' }} />
                        </div>
                        <span style={{ fontSize:11, color:'#94A3B8', flexShrink:0, whiteSpace:'nowrap', fontWeight:500 }}>{doneCount} / {steps.length} steps</span>
                      </div>
                    )}
                  </div>
                  {selectedGen.description && (
                    <div style={{ borderTop:'1px solid #F1F5F9', padding:'7px 16px', background:'#FAFBFF', fontSize:11, color:'#475569', fontFamily:F }}>{selectedGen.description}</div>
                  )}
                </div>
                <div style={{ padding:'10px 16px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:NAVY, fontFamily:F, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Steps</div>
                  {steps.length === 0 && <div style={{ fontSize:12, color:'#94A3B8', fontFamily:F, padding:'8px 0' }}>No steps added yet.</div>}
                  {steps.map((step:any) => (
                    <div key={step.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0', marginBottom:6 }}>
                      <button onClick={() => handleGenToggleStep(step.id)} disabled={genStepLoading}
                        style={{ flexShrink:0, width:20, height:20, borderRadius:5, border:`2px solid ${step.isDone ? TEAL : '#CBD5E1'}`, background: step.isDone ? TEAL : '#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                        {step.isDone && <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                      </button>
                      <span style={{ flex:1, fontSize:13, color: step.isDone ? '#94A3B8' : NAVY, fontFamily:F, textDecoration: step.isDone ? 'line-through' : 'none' }}>{step.title}</span>
                      {step.isDone && step.doneBy && <span style={{ fontSize:10, color:'#94A3B8', fontFamily:F, flexShrink:0 }}>{step.doneBy.fullName}</span>}
                      {(role === 'admin' || role === 'manager' || role === 'team_lead') && (
                        <button onClick={() => handleGenDeleteStep(step.id)} disabled={genStepLoading}
                          style={{ flexShrink:0, background:'none', border:'none', cursor:'pointer', color:'#CBD5E1', padding:2 }}>
                          <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                  {!isDone && (
                    <div style={{ display:'flex', gap:6, marginTop:8 }}>
                      <input value={genNewStep} onChange={e => setGenNewStep(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleGenAddStep() }}
                        placeholder="Add a step…"
                        style={{ flex:1, padding:'7px 11px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:12, fontFamily:F, outline:'none', color:NAVY }} />
                      <button onClick={handleGenAddStep} disabled={genStepLoading || !genNewStep.trim()}
                        style={{ padding:'7px 14px', borderRadius:8, border:'none', cursor:'pointer', background:TEAL, color:'#fff', fontSize:12, fontWeight:700, opacity: (!genNewStep.trim() || genStepLoading) ? 0.5 : 1 }}>
                        + Add
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Normal split layout (non-completedOnly / non-incompleteOnly) ── */}
      <div style={{ flex:1, overflow:'hidden', display: (completedOnly || incompleteOnly) ? 'none' : 'flex' } as React.CSSProperties}>

        {/* Left panel */}
        <div style={{ width: listCollapsed ? 0 : 340, flexShrink:0, display:'flex', flexDirection:'column', background:'#EDF0F3', borderRight:`1px solid ${P.border}`, overflow:'hidden', transition:'width .25s' }}>

          <div style={{ flexShrink:0, borderBottom:`1px solid ${P.border}` }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height:52, padding:'0 14px' }}>
              <h2 style={{ margin:0, fontFamily:"'Angelos', sans-serif", fontSize:22, color:NAVY, display:'inline-block', transform:'skewX(12deg)' }}>{activeTab.label}</h2>
              <div style={{ display:'flex', gap:6 }}>
                <button onClick={() => setListCollapsed(true)} style={{ background:'transparent', border:'none', cursor:'pointer', color:P.iconMuted, padding:4, borderRadius:6 }}>
                  <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
              </div>
            </div>
            <div style={{ padding:'0 14px 10px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, background:'#fff', border:`1px solid ${P.border}`, borderRadius:8, padding:'7px 10px' }}>
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke={P.iconMuted} strokeWidth={2} style={{ flexShrink:0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ border:'none', outline:'none', flex:1, fontSize:12, fontFamily:"'Aptos',sans-serif", background:'transparent', color:NAVY }} />
              </div>
            </div>
          </div>

          <div style={{ flex:1, overflowY:'auto' }}>
            {/* Pipeline list */}
            {isPipelineView && (
              <>
                {pipeLoading && <div style={{ padding:24, textAlign:'center', color:P.textMuted, fontSize:12 }}>Loading…</div>}
                {!pipeLoading && filteredPipe.filter(t => completedOnly ? t.status === 'COMPLETED' : t.status !== 'COMPLETED').length === 0 && (
                  <div style={{ padding:24, textAlign:'center', color:P.textMuted, fontSize:12 }}>{completedOnly ? 'No completed tasks yet.' : 'No tasks found.'}</div>
                )}
                {filteredPipe
                  .filter(t => completedOnly ? t.status === 'COMPLETED' : t.status !== 'COMPLETED')
                  .map((t, idx) => {
                    const isActive   = selectedPipe?.id === t.id
                    const isComp     = t.status === 'COMPLETED'
                    const isSB       = t.status === 'SENT_BACK'
                    const curSt      = isSB ? 'INCHARGE_REVIEW' : t.status
                    const cIdx       = isComp ? pipelineSteps.length : pipelineSteps.map(x=>x.key).indexOf(curSt)
                    const ov         = isComp        ? { label:'Complete',    color:'#fff', bg:'#0D9488' }
                                     : cIdx === 0    ? { label:'To Do',       color:'#fff', bg:'#DC2626' }
                                     :                 { label:'In Progress', color:'#fff', bg:'#F97316' }
                    const clientName = t.client?.businessName ?? t.client?.user?.fullName ?? '—'
                    const dueStr     = t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : 'No due date'
                    return (
                      <button key={t.id} onClick={() => { setSelectedPipe(t); setAdvanceForm({}) }}
                        style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 12px', border:'none', cursor:'pointer', borderBottom:`1px solid ${P.border}`, background: isActive ? '#E8EEF7' : '#F8FAFC', borderLeft: isActive ? `3px solid ${TEAL}` : '3px solid transparent' }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background='#EEF2F7' }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background='#F8FAFC' }}>

                        {(() => {
                          const auth = t.authority ?? 'FBR'
                          const a = authorityStyle(auth)
                          return (
                            <div style={{ display:'flex', gap:9, alignItems:'flex-start' }}>
                              {/* Sr circle */}
                              <span style={{ flexShrink:0, width:22, height:22, borderRadius:5, background: TEAL, color:'#fff', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', marginTop:2 }}>{idx + 1}</span>

                              {/* Right: 2 rows */}
                              <div style={{ flex:1, minWidth:0 }}>
                                {/* Row 1: client name + status */}
                                <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:5 }}>
                                  <span style={{ fontSize:12, fontWeight:700, color: isActive ? TEAL : NAVY, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{clientName}</span>
                                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, color:ov.color, background:ov.bg, flexShrink:0 }}>{ov.label}</span>
                                </div>
                                {/* Row 2: dashed chips + authority */}
                                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                                  {isSalesTaxTab && <span style={{ fontSize:10, fontWeight:700, color:a.color, background:a.bg, border:`1px solid ${a.color}22`, padding:'2px 8px', borderRadius:6 }}>{auth}</span>}
                                  {(() => { const rt = returnTypeStyle(t.returnType ?? 'ORIGINAL'); return <span style={{ fontSize:10, fontWeight:700, color:rt.color, background:rt.bg, border:`1px solid ${rt.color}22`, padding:'2px 8px', borderRadius:6 }}>{rt.label}</span> })()}
                                  <span style={{ fontSize:10, fontWeight:600, color:'#0E7490', background:'#ECFEFF', border:'1px solid #A5F3FC', padding:'2px 8px', borderRadius:6 }}>{periodLabel(t.taskType, t.periodMonth, t.periodYear)}</span>
                                  <span style={{ fontSize:10, fontWeight:600, color:'#475569', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'2px 8px', borderRadius:6 }}>Due: {dueStr}</span>
                                  {(role === 'manager' || role === 'team_lead') && t.trainee?.fullName && (
                                    <span style={{ fontSize:10, fontWeight:600, color:'#B45309', border:'1.5px dashed #D97706', background:'#FFFBEB', padding:'2px 8px', borderRadius:6 }}>{t.trainee.fullName}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                      </button>
                    )
                  })}
              </>
            )}

            {/* General tasks list */}
            {isGenView && (
              <>
                {genLoading && <div style={{ padding:24, textAlign:'center', color:P.textMuted, fontSize:12 }}>Loading…</div>}
                {!genLoading && filteredGen.length === 0 && <div style={{ padding:24, textAlign:'center', color:P.textMuted, fontSize:12 }}>No tasks found.</div>}
                {filteredGen.map((t, idx) => {
                  const isActive = selectedGen?.id === t.id
                  const sm = GEN_STATUS[t.status] ?? { color:NAVY, bg:'#eee', label: t.status }
                  const dueStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : 'N/A'
                  const doneSteps = (t.steps ?? []).filter((s:any) => s.isDone).length
                  const totalSteps = (t.steps ?? []).length
                  return (
                    <button key={t.id} onClick={() => setSelectedGen(t)}
                      style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 12px', border:'none', cursor:'pointer', borderBottom:`1px solid ${P.border}`, background: isActive ? '#E8EEF7' : '#F8FAFC', borderLeft: isActive ? `3px solid ${TEAL}` : '3px solid transparent' }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background='#EEF2F7' }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background='#F8FAFC' }}>
                      <div style={{ display:'flex', gap:9, alignItems:'flex-start' }}>
                        <span style={{ flexShrink:0, width:22, height:22, borderRadius:5, background:TEAL, color:'#fff', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', marginTop:2 }}>{idx + 1}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:5 }}>
                            <span style={{ fontSize:12, fontWeight:700, color: isActive ? TEAL : NAVY, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.title}</span>
                            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, color:sm.color, background:sm.bg, flexShrink:0 }}>{sm.label}</span>
                          </div>
                          <div style={{ display:'flex', gap:5, flexWrap:'wrap' as const }}>
                            {t.client?.businessName && <span style={{ fontSize:10, fontWeight:700, color:'#1565C0', background:'#E3F0FB', border:'1px solid #1565C022', padding:'2px 8px', borderRadius:6 }}>{t.client.businessName}</span>}
                            {t.assignedTo?.fullName && <span style={{ fontSize:10, fontWeight:600, color:'#475569', background:'#F1F5F9', border:'1px solid #E2E8F0', padding:'2px 8px', borderRadius:6 }}>{t.assignedTo.fullName}</span>}
                            {dueStr !== 'N/A' && <span style={{ fontSize:10, fontWeight:600, color:'#0E7490', background:'#ECFEFF', border:'1px solid #A5F3FC', padding:'2px 8px', borderRadius:6 }}>Due: {dueStr}</span>}
                            {totalSteps > 0 && <span style={{ fontSize:10, fontWeight:600, color:'#374151', background:'#F3F4F6', border:'1px solid #D1D5DB', padding:'2px 8px', borderRadius:6 }}>{doneSteps}/{totalSteps} steps</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </>
            )}

            {/* FBR cases list (Notices & Appeals tab) */}
            {isFbrView && (
              <>
                {fbrLoading && <div style={{ padding:24, textAlign:'center', color:P.textMuted, fontSize:12 }}>Loading…</div>}
                {!fbrLoading && filteredFbr.length === 0 && <div style={{ padding:24, textAlign:'center', color:P.textMuted, fontSize:12 }}>No cases found.</div>}
                {filteredFbr.map((c, idx) => {
                  const isActive = selectedFbr?.id === c.id
                  const stage = (() => {
                    const s = c.currentStage as string
                    if (s === 'CLOSED')       return { label: 'Closed',       color: '#065F46', bg: '#D1FAE5' }
                    if (s === 'HIGHER_FORUM') return { label: 'Higher Forum', color: '#991B1B', bg: '#FEE2E2' }
                    if (s === 'STAY')         return { label: 'Stay',          color: '#92400E', bg: '#FEF3C7' }
                    if (s === 'APPEAL')       return { label: 'Appeal',        color: '#5B21B6', bg: '#EDE9FE' }
                    return                           { label: 'Notice',        color: '#1E40AF', bg: '#DBEAFE' }
                  })()
                  const clientName = c.client?.businessName ?? c.client?.user?.fullName ?? '—'
                  return (
                    <button key={c.id} onClick={() => setSelectedFbr(c)}
                      style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 12px', border:'none', cursor:'pointer', borderBottom:`1px solid ${P.border}`, background: isActive ? '#E8EEF7' : '#F8FAFC', borderLeft: isActive ? `3px solid #1565C0` : '3px solid transparent' }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background='#EEF2F7' }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background='#F8FAFC' }}>
                      <div style={{ display:'flex', gap:9, alignItems:'flex-start' }}>
                        <span style={{ flexShrink:0, width:22, height:22, borderRadius:5, background: TEAL, color:'#fff', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', marginTop:2 }}>{idx + 1}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:5 }}>
                            <span style={{ fontSize:12, fontWeight:700, color: isActive ? '#1565C0' : NAVY, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{clientName}</span>
                            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, color: stage.color, background: stage.bg, flexShrink:0, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>{stage.label}</span>
                          </div>
                          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                            {c.taxType && <span style={{ fontSize:10, fontWeight:700, color:'#1565C0', background:'#E3F0FB', border:'1px solid #1565C022', padding:'2px 8px', borderRadius:6, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>{c.taxType.replace(/_/g,' ')}</span>}
                            {c.taxYear && <span style={{ fontSize:10, fontWeight:600, color:'#0E7490', background:'#ECFEFF', border:'1px solid #A5F3FC', padding:'2px 8px', borderRadius:6, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>FY {c.taxYear}</span>}
                            {c.noticeSection && <span style={{ fontSize:10, fontWeight:700, color:'#7B2D8E', background:'#F3E8F7', border:'1px solid #7B2D8E22', padding:'2px 8px', borderRadius:6, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>Sec {c.noticeSection}</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#f7f8fa', overflow:'hidden' }}>
          {PillsRow}

          <div style={{ flex:1, overflowY:'auto', position:'relative' }}>

            {listCollapsed && (
              <button onClick={() => setListCollapsed(false)} style={{ position:'absolute', top:12, left:12, zIndex:20, width:28, height:28, borderRadius:8, border:'none', cursor:'pointer', background:`linear-gradient(135deg,${TEAL} 0%,#0E5F6E 100%)`, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
                <svg width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            )}

            {!selectedPipe && !selectedGen && !selectedFbr && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
                <div style={{ textAlign:'center' }}>
                  <p style={{ fontSize:40, color:P.border }}>←</p>
                  <p style={{ fontSize:13, color:P.textMuted, fontFamily:"'Aptos',sans-serif" }}>{isFbrView ? 'Select a case to view details' : 'Select a task to view details'}</p>
                </div>
              </div>
            )}

            {/* ── Pipeline detail ── */}
            {pipelineDetailContent}

            {/* ── FBR case detail ── */}
            {isFbrView && selectedFbr && (
              <div style={{ position:'relative' }}>
                <button onClick={() => setSelectedFbr(null)}
                  style={{ position:'absolute', top:12, right:12, zIndex:10, width:28, height:28, borderRadius:8, border:'none', cursor:'pointer', background:'#F1F5F9', color:'#64748B', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width={10} height={10} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <FbrCaseDetail
                  case={selectedFbr}
                  onUpdated={(updated: any) => setSelectedFbr(updated)}
                  onReload={() => {
                    fetchFbrCases()
                    // re-fetch the selected case to get latest data
                    api.get(`/fbr/cases/${selectedFbr.id}`).then(r => {
                      const d = r.data?.data ?? r.data
                      if (d) setSelectedFbr(d)
                    }).catch(() => {})
                  }}
                />
              </div>
            )}

            {/* ── General task detail ── */}
            {isGenView && selectedGen && (() => {
              const F = "'Inter','DM Sans',-apple-system,sans-serif"
              const sm = GEN_STATUS[selectedGen.status] ?? { label: selectedGen.status, color: NAVY, bg: '#eee' }
              const isDone = selectedGen.status === 'DONE'
              const steps: any[] = selectedGen.steps ?? []
              const doneCount = steps.filter((s:any) => s.isDone).length
              const pctW = steps.length > 0 ? `${Math.round((doneCount / steps.length) * 100)}%` : '0%'
              const priColor: Record<string,string> = { HIGH:'#DC2626', URGENT:'#BE123C', LOW:'#16a34a', MEDIUM:'#1D4ED8' }
              const priBg:    Record<string,string> = { HIGH:'#FEE2E2', URGENT:'#FFE4E6', LOW:'#F0FDF4', MEDIUM:'#EFF6FF' }
              const pri = (selectedGen.priority ?? 'MEDIUM') as string
              return (
                <div style={{ fontFamily:F, minHeight:'100%' }}>
                  {/* Header card */}
                  <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:12, overflow:'hidden', margin:'12px 16px 4px' }}>
                    <div style={{ padding:'14px 16px 12px' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                        <div style={{ width:42, height:42, borderRadius:10, background:'#374151', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#fff', fontSize:14, fontWeight:700, letterSpacing:'0.05em' }}>
                          {selectedGen.title.split(' ').slice(0,2).map((w:string)=>w[0]).join('').toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                            <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:NAVY, letterSpacing:'-0.02em', lineHeight:1.2, fontFamily:F }}>{selectedGen.title}</h2>
                            <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                              <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:600, color:sm.color, background:sm.bg, padding:'3px 10px', borderRadius:20 }}>
                                <span style={{ width:6, height:6, borderRadius:'50%', background:sm.color, flexShrink:0 }} />{sm.label}
                              </span>
                              <button onClick={() => { setSelectedGen(null); setListCollapsed(false) }}
                                style={{ background:'#F1F5F9', border:'none', cursor:'pointer', color:'#64748B', width:24, height:24, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <svg width={10} height={10} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          </div>
                          <p style={{ margin:'2px 0 0', fontSize:12, color:'#64748B', fontFamily:F }}>General Task</p>
                        </div>
                      </div>
                      <div style={{ height:1, background:'#F1F5F9', margin:'12px 0' }} />
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                        {selectedGen.assignedTo?.fullName && (
                          <span style={{ fontSize:11, color:'#334155', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'3px 10px', borderRadius:6 }}>
                            <span style={{ color:'#94A3B8', fontWeight:600 }}>Assigned: </span>{selectedGen.assignedTo.fullName}
                          </span>
                        )}
                        {selectedGen.client && (
                          <span style={{ fontSize:11, color:'#334155', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'3px 10px', borderRadius:6 }}>
                            <span style={{ color:'#94A3B8', fontWeight:600 }}>Client: </span>{selectedGen.client.businessName ?? selectedGen.client.user?.fullName}
                          </span>
                        )}
                        {selectedGen.dueDate && (
                          <span style={{ fontSize:11, color:'#334155', background:'#F0FAFB', border:'1px solid #A5F3FC', padding:'3px 10px', borderRadius:6 }}>
                            <span style={{ color:'#94A3B8', fontWeight:600 }}>Due: </span>{new Date(selectedGen.dueDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}
                          </span>
                        )}
                        <span style={{ fontSize:11, color:priColor[pri]??'#1D4ED8', background:priBg[pri]??'#EFF6FF', border:`1px solid ${priColor[pri]??'#1D4ED8'}22`, padding:'3px 10px', borderRadius:6 }}>
                          <span style={{ color:'#94A3B8', fontWeight:600 }}>Priority: </span><span style={{ fontWeight:700 }}>{pri}</span>
                        </span>
                        {!isDone && (
                          <button onClick={() => handleGenStatus('DONE')} disabled={genActLoading}
                            style={{ padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px solid #16a34a', background:'#F0FDF4', color:'#16a34a', lineHeight:1 }}>
                            ✓ Mark Complete
                          </button>
                        )}
                        {isDone && canMarkIncomplete && (
                          <button onClick={() => handleGenStatus('IN_PROGRESS')} disabled={genActLoading}
                            style={{ padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px dashed #D97706', background:'#FFFBEB', color:'#D97706', lineHeight:1 }}>
                            ↩ Mark Incomplete
                          </button>
                        )}
                        {canDeleteTask && (
                          <button onClick={() => setGenDeleteConfirm(true)}
                            style={{ padding:'3px 9px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', border:'1.5px dashed #DC2626', background:'#FEF2F2', color:'#DC2626', lineHeight:1 }}>
                            🗑 Delete Task
                          </button>
                        )}
                      </div>
                      {steps.length > 0 && (
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ flex:1, height:6, background:'#E2E8F0', borderRadius:3, overflow:'hidden' }}>
                            <div style={{ height:'100%', borderRadius:3, width:pctW, background: isDone ? '#22C55E' : TEAL, transition:'width .4s' }} />
                          </div>
                          <span style={{ fontSize:11, color:'#94A3B8', flexShrink:0, whiteSpace:'nowrap', fontWeight:500 }}>{doneCount} / {steps.length} steps</span>
                        </div>
                      )}
                    </div>
                    {selectedGen.description && (
                      <div style={{ borderTop:'1px solid #F1F5F9', padding:'7px 16px', background:'#FAFBFF', fontSize:11, color:'#475569', fontFamily:F }}>{selectedGen.description}</div>
                    )}
                  </div>

                  {/* Steps */}
                  <div style={{ padding:'10px 16px' }}>
                    <div style={{ fontSize:12, fontWeight:700, color:NAVY, fontFamily:F, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Steps</div>

                    {steps.length === 0 && (
                      <div style={{ fontSize:12, color:'#94A3B8', fontFamily:F, padding:'8px 0' }}>No steps added yet.</div>
                    )}

                    {steps.map((step:any) => (
                      <div key={step.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#fff', borderRadius:8, border:'1px solid #E2E8F0', marginBottom:6 }}>
                        <button onClick={() => handleGenToggleStep(step.id)} disabled={genStepLoading}
                          style={{ flexShrink:0, width:20, height:20, borderRadius:5, border:`2px solid ${step.isDone ? TEAL : '#CBD5E1'}`, background: step.isDone ? TEAL : '#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                          {step.isDone && <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                        </button>
                        <span style={{ flex:1, fontSize:13, color: step.isDone ? '#94A3B8' : NAVY, fontFamily:F, textDecoration: step.isDone ? 'line-through' : 'none' }}>{step.title}</span>
                        {step.isDone && step.doneBy && (
                          <span style={{ fontSize:10, color:'#94A3B8', fontFamily:F, flexShrink:0 }}>{step.doneBy.fullName}</span>
                        )}
                        {(role === 'admin' || role === 'manager' || role === 'team_lead') && (
                          <button onClick={() => handleGenDeleteStep(step.id)} disabled={genStepLoading}
                            style={{ flexShrink:0, background:'none', border:'none', cursor:'pointer', color:'#CBD5E1', padding:2, display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    ))}

                    {/* Add step input */}
                    {!isDone && (
                      <div style={{ display:'flex', gap:6, marginTop:8 }}>
                        <input value={genNewStep} onChange={e => setGenNewStep(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleGenAddStep() }}
                          placeholder="Add a step…"
                          style={{ flex:1, padding:'7px 11px', borderRadius:8, border:'1.5px solid #E2E8F0', fontSize:12, fontFamily:F, outline:'none', color:NAVY }} />
                        <button onClick={handleGenAddStep} disabled={genStepLoading || !genNewStep.trim()}
                          style={{ padding:'7px 14px', borderRadius:8, border:'none', cursor:'pointer', background:TEAL, color:'#fff', fontSize:12, fontWeight:700, fontFamily:F, opacity: (!genNewStep.trim() || genStepLoading) ? 0.5 : 1 }}>
                          + Add
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

          </div>
        </div>
      </div>

      {/* Advance modal — Sales Tax FILED: full styled modal */}
      {advanceModal && selectedPipe && selectedPipe.status === 'FILED' && selectedPipe.taskType === 'SALES_TAX' && (() => {
        const F = "'Aptos', sans-serif"
        const fmtAcct = (raw: string) => {
          const n = parseFloat(raw.replace(/,/g, ''))
          if (isNaN(n)) return raw
          return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
        }
        const numInp = (key: string) => (
          <input key={key}
            value={advanceForm[key] ?? ''}
            onChange={e => setAdvanceForm(p => ({...p,[key]:e.target.value.replace(/,/g,'')}))}
            onBlur={e => { const v = e.target.value; if (v !== '') setAdvanceForm(p => ({...p,[key]:fmtAcct(v)})) }}
            onFocus={() => setAdvanceForm(p => ({...p,[key]:(p[key] ?? '').replace(/,/g,'')}))}
            placeholder="0"
            style={{ width:'100%', boxSizing:'border-box', padding:'8px 11px', borderRadius:8, border:`1.5px solid ${P.border}`, fontSize:13, fontFamily:F, outline:'none', color:NAVY, fontWeight:500, background:'#FAFBFC' }} />
        )
        const lbl = (text: string) => <div style={{ fontSize:11, fontWeight:700, color:'#64748B', fontFamily:F, marginBottom:4 }}>{text}</div>
        const sectionHdr = (text: string, color: string) => (
          <div style={{ display:'flex', alignItems:'center', gap:8, margin:'16px 0 10px' }}>
            <div style={{ width:3, height:14, borderRadius:2, background:color, flexShrink:0 }} />
            <span style={{ fontSize:11, fontWeight:800, color, fontFamily:F, letterSpacing:'0.04em', textTransform:'uppercase' as const }}>{text}</span>
            <div style={{ flex:1, height:1, background:P.border }} />
          </div>
        )
        const ST_AMOUNT_KEYS = ['standardSales','outputTaxStandard','reducedRateSales','outputTaxReduced','exemptSales','zeroRatedSales','standardPurchases','inputTaxStandard','reducedRatePurchases','inputTaxReduced','unregisteredPurchases','exemptPurchases','zeroRatedPurchases','normalTaxPayable','furtherTaxPayable','taxCarryForward']
        const summaryFilled = ST_AMOUNT_KEYS.some(k => advanceForm[k] !== '' && advanceForm[k] != null)
        const clientName = selectedPipe.client?.businessName ?? selectedPipe.client?.user?.fullName ?? ''
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:580, boxShadow:'0 24px 60px rgba(0,0,0,0.22)', maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
              {/* Header */}
              <div style={{ background:'#7EC8D0', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:300, color:NAVY, fontFamily:"'Ethnocentric Rg', sans-serif", letterSpacing:'0.04em' }}>Add Sales Tax Entry</div>
                  <div style={{ fontSize:12, color:NAVY, fontFamily:F, marginTop:3, fontWeight:600, opacity:0.75 }}>{clientName}</div>
                </div>
                <button onClick={() => { setAdvanceModal(false); setAdvanceForm({}) }} style={{ background:'rgba(255,255,255,0.35)', border:'none', borderRadius:8, width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:NAVY, fontSize:18, lineHeight:1, fontWeight:700 }}>×</button>
              </div>
              {/* Body */}
              <div style={{ overflowY:'auto', padding:'16px 20px', flex:1 }}>
                {sectionHdr('Sales', '#1E8496')}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 14px' }}>
                  {([['standardSales','Standard Sales (excl. tax)'],['outputTaxStandard','Output Tax on Standard Sales'],['reducedRateSales','Reduced Rate Sales (excl. tax)'],['outputTaxReduced','Output Tax on Reduced Rate'],['exemptSales','Exempt Sales'],['zeroRatedSales','Zero Rated Sales']] as [string,string][]).map(([k,l]) => <div key={k}>{lbl(l)}{numInp(k)}</div>)}
                </div>
                {sectionHdr('Purchases', '#7B2D8E')}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 14px' }}>
                  {([['standardPurchases','Standard Purchases (excl. tax)'],['inputTaxStandard','Input Tax on Standard'],['reducedRatePurchases','Reduced Rate Purchases (excl. tax)'],['inputTaxReduced','Input Tax on Reduced Rate'],['unregisteredPurchases','Unregistered Purchases'],['exemptPurchases','Exempt Purchases'],['zeroRatedPurchases','Zero Rated Purchases']] as [string,string][]).map(([k,l]) => <div key={k}>{lbl(l)}{numInp(k)}</div>)}
                </div>
                {sectionHdr('Tax Payable', '#C25A1F')}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px 14px' }}>
                  {([['normalTaxPayable','Normal Tax Payable'],['furtherTaxPayable','Further Tax Payable'],['taxCarryForward','Tax Carry Forward']] as [string,string][]).map(([k,l]) => <div key={k}>{lbl(l)}{numInp(k)}</div>)}
                </div>
              </div>
              {/* Footer */}
              <div style={{ padding:'12px 20px', borderTop:`1px solid ${P.border}`, display:'flex', flexDirection:'column', gap:6, background:'#FAFBFC', flexShrink:0 }}>
                {!summaryFilled && <p style={{ margin:0, fontSize:11, color:'#DC2626', fontFamily:F, textAlign:'right' }}>Please fill at least one amount field before submitting.</p>}
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                  <button onClick={() => { setAdvanceModal(false); setAdvanceForm({}) }} style={{ padding:'9px 20px', borderRadius:9, border:`1.5px solid ${P.border}`, background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F, color:'#64748B' }}>Cancel</button>
                  <button onClick={handleAdvance} disabled={actionLoading || !summaryFilled} style={{ padding:'9px 24px', borderRadius:9, border:'none', cursor:(!summaryFilled||actionLoading)?'not-allowed':'pointer', background:`linear-gradient(135deg,${NAVY} 0%,${TEAL} 100%)`, color:'#fff', fontSize:13, fontWeight:700, fontFamily:F, opacity:(!summaryFilled||actionLoading)?0.5:1 }}>
                    {actionLoading ? 'Processing…' : 'Submit'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Advance modal — Income Tax FILED: full styled modal */}
      {advanceModal && selectedPipe && selectedPipe.status === 'FILED' && selectedPipe.taskType === 'INCOME_TAX' && (() => {
        const F = "'Aptos', sans-serif"
        const fmtAcct = (raw: string) => { const n = parseFloat(raw.replace(/,/g,'')); return isNaN(n) ? raw : n.toLocaleString('en-US', { minimumFractionDigits:0, maximumFractionDigits:2 }) }
        const numInp = (key: string) => (
          <input key={key}
            value={advanceForm[key] ?? ''}
            onChange={e => setAdvanceForm(p => ({...p,[key]:e.target.value.replace(/,/g,'')}))}
            onBlur={e  => { const v = e.target.value; if (v !== '') setAdvanceForm(p => ({...p,[key]:fmtAcct(v)})) }}
            onFocus={() => setAdvanceForm(p => ({...p,[key]:(p[key]??'').replace(/,/g,'')}))}
            placeholder="0"
            style={{ width:'100%', boxSizing:'border-box', padding:'8px 11px', borderRadius:8, border:`1.5px solid ${P.border}`, fontSize:13, fontFamily:F, outline:'none', color:NAVY, fontWeight:500, background:'#FAFBFC' }} />
        )
        const lbl = (text: string) => <div style={{ fontSize:11, fontWeight:700, color:'#64748B', fontFamily:F, marginBottom:4 }}>{text}</div>
        const IT_AMOUNT_KEYS = ['totalProfitLoss','profitLossExempt','amountSubjectNormal','normalIncomeTax','turnoverTax','taxOnAccountingProfit','differenceMinimumTax','superTax','taxChargeable','admittedIncomeTax','refundableIncomeTax']
        const summaryFilled = IT_AMOUNT_KEYS.some(k => advanceForm[k] !== '' && advanceForm[k] != null)
        const clientName = selectedPipe.client?.businessName ?? selectedPipe.client?.user?.fullName ?? ''
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:580, boxShadow:'0 24px 60px rgba(0,0,0,0.22)', maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
              <div style={{ background:'#7EC8D0', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:300, color:NAVY, fontFamily:"'Ethnocentric Rg', sans-serif", letterSpacing:'0.04em' }}>Add Income Tax Entry</div>
                  <div style={{ fontSize:12, color:NAVY, fontFamily:F, marginTop:3, fontWeight:600, opacity:0.75 }}>{clientName} · {selectedPipe.periodYear}</div>
                </div>
                <button onClick={() => { setAdvanceModal(false); setAdvanceForm({}) }} style={{ background:'rgba(255,255,255,0.35)', border:'none', borderRadius:8, width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:NAVY, fontSize:18, fontWeight:700 }}>×</button>
              </div>
              <div style={{ overflowY:'auto', padding:'16px 20px', flex:1 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 14px' }}>
                  {([
                    ['totalProfitLoss',       'Total Profit/Loss'],
                    ['profitLossExempt',      'Profit/Loss exempt or final tax'],
                    ['amountSubjectNormal',   'Amount subject to normal tax'],
                    ['normalIncomeTax',       'Normal income tax'],
                    ['turnoverTax',           'Turnover tax'],
                    ['taxOnAccountingProfit', 'Tax on accounting profit'],
                    ['differenceMinimumTax',  'Difference of minimum tax'],
                    ['superTax',              'Super tax / High earning'],
                    ['taxChargeable',         'Tax chargeable'],
                    ['admittedIncomeTax',     'Admitted income tax'],
                    ['refundableIncomeTax',   'Refundable income tax'],
                  ] as [string,string][]).map(([k,l]) => <div key={k}>{lbl(l)}{numInp(k)}</div>)}
                </div>
              </div>
              <div style={{ padding:'12px 20px', borderTop:`1px solid ${P.border}`, display:'flex', flexDirection:'column', gap:6, background:'#FAFBFC', flexShrink:0 }}>
                {!summaryFilled && <p style={{ margin:0, fontSize:11, color:'#DC2626', fontFamily:F, textAlign:'right' }}>Please fill at least one amount field before submitting.</p>}
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                  <button onClick={() => { setAdvanceModal(false); setAdvanceForm({}) }} style={{ padding:'9px 20px', borderRadius:9, border:`1.5px solid ${P.border}`, background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F, color:'#64748B' }}>Cancel</button>
                  <button onClick={handleAdvance} disabled={actionLoading || !summaryFilled} style={{ padding:'9px 24px', borderRadius:9, border:'none', cursor:(!summaryFilled||actionLoading)?'not-allowed':'pointer', background:`linear-gradient(135deg,${NAVY} 0%,${TEAL} 100%)`, color:'#fff', fontSize:13, fontWeight:700, fontFamily:F, opacity:(!summaryFilled||actionLoading)?0.5:1 }}>
                    {actionLoading ? 'Processing…' : 'Submit'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Advance modal — all other steps */}
      {advanceModal && selectedPipe && !(selectedPipe.status === 'FILED' && (selectedPipe.taskType === 'SALES_TAX' || selectedPipe.taskType === 'INCOME_TAX')) && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:24, width:'100%', maxWidth:560, boxShadow:'0 8px 40px rgba(0,0,0,0.18)', maxHeight:'90vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 4px', fontSize:16, fontWeight:900, color:NAVY, fontFamily:"'Aptos',sans-serif" }}>
              {selectedPipe.status === 'SENT_BACK' ? 'Re-submit to Manager' : (ADVANCE_LABEL[selectedPipe.status] ?? 'Move Forward')}
            </h3>
            <p style={{ margin:'0 0 16px', fontSize:12, color:P.textMuted, fontFamily:"'Aptos',sans-serif" }}>{selectedPipe.client?.user?.fullName} · {periodLabel(selectedPipe.taskType, selectedPipe.periodMonth, selectedPipe.periodYear)}</p>
            {selectedPipe.status === 'CHALLAN_GENERATED' && (
              <div style={{ marginBottom:12 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:P.textLabel, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Aptos',sans-serif" }}>PSID</label>
                <input value={advanceForm.psid ?? ''} onChange={e => setAdvanceForm(p => ({...p,psid:e.target.value}))} placeholder="Enter PSID" style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:8, border:`1px solid ${P.border}`, fontSize:13, fontFamily:"'Aptos',sans-serif", outline:'none' }} />
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:P.textLabel, margin:'10px 0 4px', textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Aptos',sans-serif" }}>Challan Amount</label>
                <input value={advanceForm.challanAmount ?? ''} onChange={e => setAdvanceForm(p => ({...p,challanAmount:e.target.value}))} placeholder="0.00" type="number" style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:8, border:`1px solid ${P.border}`, fontSize:13, fontFamily:"'Aptos',sans-serif", outline:'none' }} />
              </div>
            )}
            {selectedPipe.status === 'FILED' && (
              <div style={{ marginBottom:12 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:P.textLabel, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Aptos',sans-serif" }}>Fee Invoice No.</label>
                <input value={advanceForm.feeInvoiceNo ?? ''} onChange={e => setAdvanceForm(p => ({...p,feeInvoiceNo:e.target.value}))} placeholder="Invoice number" style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:8, border:`1px solid ${P.border}`, fontSize:13, fontFamily:"'Aptos',sans-serif", outline:'none' }} />
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:P.textLabel, margin:'10px 0 4px', textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Aptos',sans-serif" }}>Fee Invoice Amount</label>
                <input value={advanceForm.feeInvoiceAmount ?? ''} onChange={e => setAdvanceForm(p => ({...p,feeInvoiceAmount:e.target.value}))} placeholder="0.00" type="number" style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:8, border:`1px solid ${P.border}`, fontSize:13, fontFamily:"'Aptos',sans-serif", outline:'none' }} />

                {/* Sales Tax Summary fields — only for SALES_TAX tasks */}
                {selectedPipe.taskType === 'SALES_TAX' && (() => {
                  const F = "'Aptos', sans-serif"
                  const numInp = (key: string) => (
                    <input key={key} value={advanceForm[key] ?? ''} onChange={e => setAdvanceForm(p => ({...p,[key]:e.target.value}))}
                      type="number" placeholder="0"
                      style={{ width:'100%', boxSizing:'border-box', padding:'8px 11px', borderRadius:8, border:`1.5px solid ${P.border}`, fontSize:13, fontFamily:F, outline:'none', color:NAVY, fontWeight:500, background:'#FAFBFC' }} />
                  )
                  const lbl = (text: string) => (
                    <div style={{ fontSize:11, fontWeight:700, color:'#64748B', fontFamily:F, marginBottom:4 }}>{text}</div>
                  )
                  const sectionHdr = (text: string, color: string) => (
                    <div style={{ display:'flex', alignItems:'center', gap:8, margin:'14px 0 10px' }}>
                      <div style={{ width:3, height:14, borderRadius:2, background:color, flexShrink:0 }} />
                      <span style={{ fontSize:11, fontWeight:800, color, fontFamily:F, letterSpacing:'0.04em', textTransform:'uppercase' as const }}>{text}</span>
                      <div style={{ flex:1, height:1, background:P.border }} />
                    </div>
                  )
                  return (
                    <div style={{ marginTop:14, borderTop:`1px solid ${P.border}`, paddingTop:12 }}>
                      {sectionHdr('Sales', '#1E8496')}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 14px' }}>
                        {([['standardSales','Standard Sales (excl. tax)'],['outputTaxStandard','Output Tax on Std Sales'],['reducedRateSales','Reduced Rate Sales (excl. tax)'],['outputTaxReduced','Output Tax on Reduced Rate'],['exemptSales','Exempt Sales'],['zeroRatedSales','Zero Rated Sales']] as [string,string][]).map(([k,l]) => (
                          <div key={k}>{lbl(l)}{numInp(k)}</div>
                        ))}
                      </div>

                      {sectionHdr('Purchases', '#7B2D8E')}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 14px' }}>
                        {([['standardPurchases','Standard Purchases (excl. tax)'],['inputTaxStandard','Input Tax on Standard'],['reducedRatePurchases','Reduced Rate Purchases (excl. tax)'],['inputTaxReduced','Input Tax on Reduced Rate'],['unregisteredPurchases','Unregistered Purchases'],['exemptPurchases','Exempt Purchases'],['zeroRatedPurchases','Zero Rated Purchases']] as [string,string][]).map(([k,l]) => (
                          <div key={k}>{lbl(l)}{numInp(k)}</div>
                        ))}
                      </div>

                      {sectionHdr('Tax Payable', '#C25A1F')}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px 14px' }}>
                        {([['normalTaxPayable','Normal Tax Payable'],['furtherTaxPayable','Further Tax Payable'],['taxCarryForward','Tax Carry Forward']] as [string,string][]).map(([k,l]) => (
                          <div key={k}>{lbl(l)}{numInp(k)}</div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:P.textLabel, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Aptos',sans-serif" }}>Comment <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(optional)</span></label>
            <textarea value={advanceForm.comment ?? ''} onChange={e => setAdvanceForm(p => ({...p,comment:e.target.value}))} rows={3} placeholder="Add a comment…" style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:8, border:`1px solid ${P.border}`, fontSize:13, fontFamily:"'Aptos',sans-serif", outline:'none', resize:'none', marginBottom:12 }} />
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:P.textLabel, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Aptos',sans-serif" }}>Attachment <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0 }}>(optional)</span></label>
            <input value={advanceForm.attachment ?? ''} onChange={e => setAdvanceForm(p => ({...p,attachment:e.target.value}))} placeholder="File name or reference (e.g. draft_return.pdf)" style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:8, border:`1px solid ${P.border}`, fontSize:13, fontFamily:"'Aptos',sans-serif", outline:'none', marginBottom:16 }} />
            {(() => {
              const ST_AMOUNT_KEYS = ['standardSales','outputTaxStandard','reducedRateSales','outputTaxReduced','exemptSales','zeroRatedSales','standardPurchases','inputTaxStandard','reducedRatePurchases','inputTaxReduced','unregisteredPurchases','exemptPurchases','zeroRatedPurchases','normalTaxPayable','furtherTaxPayable','taxCarryForward']
              const needsSummary = selectedPipe?.status === 'FILED' && (selectedPipe?.taskType === 'SALES_TAX' || selectedPipe?.taskType === 'INCOME_TAX')
              const summaryFilled = !needsSummary || ST_AMOUNT_KEYS.some(k => advanceForm[k] !== '' && advanceForm[k] != null)
              return (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {needsSummary && !summaryFilled && (
                    <p style={{ margin:0, fontSize:11, color:'#DC2626', fontFamily:"'Aptos',sans-serif", textAlign:'right' }}>
                      Please fill at least one Sales Tax amount field before submitting.
                    </p>
                  )}
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                    <button onClick={() => { setAdvanceModal(false); setAdvanceForm({}) }} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${P.border}`, background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Aptos',sans-serif", color:P.textLabel }}>Cancel</button>
                    <button onClick={handleAdvance} disabled={actionLoading || !summaryFilled} style={{ padding:'8px 18px', borderRadius:8, border:'none', cursor: (!summaryFilled || actionLoading) ? 'not-allowed' : 'pointer', background:`linear-gradient(135deg,${NAVY} 0%,${TEAL} 100%)`, color:'#fff', fontSize:13, fontWeight:700, fontFamily:"'Aptos',sans-serif", opacity: (actionLoading || !summaryFilled) ? 0.5 : 1 }}>
                      {actionLoading ? 'Processing…' : 'Confirm'}
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Assign Task modal */}
      {assignModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:24, width:'100%', maxWidth:460, boxShadow:'0 8px 40px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin:'0 0 4px', fontSize:16, fontWeight:900, color:NAVY, fontFamily:"'Aptos',sans-serif" }}>Assign {activeTab.label} Task</h3>
            <p style={{ margin:'0 0 18px', fontSize:12, color:P.textMuted, fontFamily:"'Aptos',sans-serif" }}>Assign a {activeTax === 'wht' ? 'quarterly' : activeTax === 'income_tax' ? 'yearly' : 'monthly'} {activeTab.label} filing task to a trainee.</p>

            {/* Client */}
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:P.textLabel, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Aptos',sans-serif" }}>Client *</label>
            <div style={{ marginBottom:12 }}>
              <StyledSelect
                value={assignForm.clientId}
                onChange={val => setAssignForm(p => ({...p, clientId:val}))}
                options={clientList.map((c:any) => ({ value: c.id, label: c.businessName ?? c.user?.fullName ?? '' }))}
                placeholder="Select client…"
              />
            </div>

            {/* Trainee */}
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:P.textLabel, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Aptos',sans-serif" }}>Assign To *</label>
            <div style={{ marginBottom:12 }}>
              <StyledSelect
                value={assignForm.traineeId}
                onChange={val => setAssignForm(p => ({...p, traineeId:val}))}
                options={traineeList.map((u:any) => ({ value: u.id, label: `${u.fullName}${u.userCode ? ` (${u.userCode})` : ''}${u.role !== 'TRAINEE' ? ` (${u.role.charAt(0) + u.role.slice(1).toLowerCase()})` : ''}` }))}
                placeholder="Select user…"
              />
            </div>

            {/* Period */}
            <div style={{ display:'flex', gap:10, marginBottom:12 }}>
              {/* Month — Sales Tax only */}
              {activeTax === 'sales_tax' && (
                <div style={{ flex:1 }}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:P.textLabel, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Aptos',sans-serif" }}>Month *</label>
                  <StyledSelect
                    value={String(assignForm.periodMonth)}
                    onChange={val => setAssignForm(p => ({...p, periodMonth:Number(val)}))}
                    options={['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i) => ({ value: String(i+1), label: m }))}
                  />
                </div>
              )}
              {activeTax === 'wht' && (
                <div style={{ flex:1 }}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:P.textLabel, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Aptos',sans-serif" }}>Quarter *</label>
                  <StyledSelect
                    value={String(assignForm.periodMonth)}
                    onChange={val => setAssignForm(p => ({...p, periodMonth:Number(val)}))}
                    options={['Q1 (Jan–Mar)','Q2 (Apr–Jun)','Q3 (Jul–Sep)','Q4 (Oct–Dec)'].map((q,i) => ({ value: String(i+1), label: q }))}
                  />
                </div>
              )}
              <div style={{ flex:1 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:P.textLabel, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Aptos',sans-serif" }}>Year *</label>
                <StyledSelect
                  value={String(assignForm.periodYear)}
                  onChange={val => setAssignForm(p => ({...p, periodYear:Number(val)}))}
                  options={[2024,2025,2026,2027].map(y => ({ value: String(y), label: String(y) }))}
                />
              </div>
            </div>

            {/* Authority + Return Type — Sales Tax only */}
            {activeTax === 'sales_tax' && (
              <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:P.textLabel, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Aptos',sans-serif" }}>Authority *</label>
                  <StyledSelect
                    value={assignForm.authority}
                    onChange={val => setAssignForm(p => ({...p, authority:val}))}
                    options={TAX_AUTHORITIES.map(a => ({ value: a.key, label: a.label }))}
                  />
                </div>
                <div style={{ flex:1 }}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:P.textLabel, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Aptos',sans-serif" }}>Return Type *</label>
                  <StyledSelect
                    value={assignForm.returnType}
                    onChange={val => setAssignForm(p => ({...p, returnType:val}))}
                    options={RETURN_TYPES.map(r => ({ value: r.key, label: r.label }))}
                  />
                </div>
              </div>
            )}

            {/* Due Date */}
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:P.textLabel, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em', fontFamily:"'Aptos',sans-serif" }}>Due Date (optional)</label>
            <input type="date" value={assignForm.dueDate} onChange={e => setAssignForm(p => ({...p, dueDate:e.target.value}))}
              style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:8, border:`1px solid ${P.border}`, fontSize:13, fontFamily:"'Aptos',sans-serif", outline:'none', marginBottom:18, color:NAVY }} />

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setAssignModal(false)} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${P.border}`, background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Aptos',sans-serif", color:P.textLabel }}>Cancel</button>
              <button onClick={submitAssignTask} disabled={assignLoading || !assignForm.clientId || !assignForm.traineeId}
                style={{ padding:'8px 20px', borderRadius:8, border:'none', cursor:'pointer', background:`linear-gradient(135deg,${NAVY} 0%,${TEAL} 100%)`, color:'#fff', fontSize:13, fontWeight:700, fontFamily:"'Aptos',sans-serif", opacity:(assignLoading || !assignForm.clientId || !assignForm.traineeId) ? 0.6 : 1 }}>
                {assignLoading ? 'Assigning…' : 'Assign Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Step modal */}
      {addStepModal.open && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:24, width:'100%', maxWidth:440, boxShadow:'0 8px 40px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin:'0 0 16px', fontSize:16, fontWeight:700, color:NAVY }}>Add Custom Step</h3>

            {/* Step selector — shown when opened from header */}
            <div style={{ marginBottom:12 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#64748B', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Insert After Step *</label>
              <StyledSelect
                value={addStepModal.insertAfter}
                onChange={val => setAddStepModal(p => ({...p, insertAfter: val}))}
                placeholder="Select step…"
                options={pipelineSteps.map((s, i) => ({ value: s.key, label: `Step ${i+1}: ${s.label.slice(0,50)}${s.label.length > 50 ? '…' : ''}` }))}
              />
            </div>

            <div style={{ marginBottom:12 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#64748B', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Step Title *</label>
              <input value={addStepForm.title} onChange={e => setAddStepForm(p => ({...p, title: e.target.value}))}
                placeholder="e.g. Client Data Verification"
                style={{ width:'100%', boxSizing:'border-box', padding:'8px 10px', borderRadius:6, border:'1px solid #E2E8F0', fontSize:13, outline:'none', color:NAVY }} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#64748B', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>Description (optional)</label>
              <textarea value={addStepForm.description} onChange={e => setAddStepForm(p => ({...p, description: e.target.value}))}
                placeholder="Details about this step…" rows={2}
                style={{ width:'100%', boxSizing:'border-box', padding:'8px 10px', borderRadius:6, border:'1px solid #E2E8F0', fontSize:13, outline:'none', resize:'none', color:NAVY }} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#64748B', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Completed By</label>
              <div style={{ display:'flex', gap:8 }}>
                {(['TRAINEE', 'MANAGER'] as const).map(v => (
                  <button key={v} onClick={() => setAddStepForm(p => ({...p, approvedBy: v}))}
                    style={{ flex:1, padding:'7px 0', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer',
                      border:`2px solid ${addStepForm.approvedBy === v ? TEAL : '#E2E8F0'}`,
                      background: addStepForm.approvedBy === v ? '#F0FAFB' : '#fff',
                      color: addStepForm.approvedBy === v ? TEAL : '#94A3B8' }}>
                    {v === 'TRAINEE' ? 'Trainee' : 'Manager'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setAddStepModal({ open:false, insertAfter:'' })}
                style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #E2E8F0', background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', color:'#64748B' }}>
                Cancel
              </button>
              <button onClick={handleAddCustomStep} disabled={!addStepForm.title.trim() || !addStepModal.insertAfter || customStepLoading}
                style={{ padding:'8px 20px', borderRadius:8, border:'none', cursor:'pointer', background:TEAL, color:'#fff', fontSize:13, fontWeight:700,
                  opacity: (!addStepForm.title.trim() || !addStepModal.insertAfter || customStepLoading) ? 0.5 : 1 }}>
                {customStepLoading ? 'Adding…' : 'Add Step'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Step modal */}
      {deleteStepModal && selectedPipe && (() => {
        const sk: string[] = selectedPipe.skippedSteps ?? []
        const isSentBackD = selectedPipe.status === 'SENT_BACK'
        const curStD = isSentBackD ? 'INCHARGE_REVIEW' : selectedPipe.status
        const curIdxD = selectedPipe.status === 'COMPLETED' ? pipelineSteps.length : pipelineSteps.map(x=>x.key).indexOf(curStD)

        // Fixed steps that are upcoming and not yet skipped
        // Manager sees all future steps; trainee sees only trainee steps
        const fixedDeletable = pipelineSteps
          .filter(s => (role === 'manager' || role === 'team_lead' || s.by === 'Trainee') && pipelineSteps.map(x=>x.key).indexOf(s.key) > curIdxD && !sk.includes(s.key))
          .map(s => ({ value: `fixed:${s.key}`, label: `Step ${pipelineSteps.map(x=>x.key).indexOf(s.key)+1}: ${s.label}`, sub: `Fixed step (${s.by})` }))

        // Custom steps that are not completed
        // Manager sees all custom steps; trainee sees only TRAINEE-approved ones
        const customDeletable = (selectedPipe.customSteps ?? [])
          .filter((cs:any) => !cs.isCompleted && (role === 'manager' || role === 'team_lead' || cs.approvedBy === 'TRAINEE'))
          .map((cs:any) => ({
            value: `custom:${cs.id}`,
            label: cs.title,
            sub: `Custom (${cs.approvedBy}) after: ${pipelineSteps.find(s=>s.key===cs.insertAfter)?.label?.slice(0,30) ?? cs.insertAfter}`,
          }))

        const allDeletable = [...fixedDeletable, ...customDeletable]

        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div style={{ background:'#fff', borderRadius:14, padding:24, width:'100%', maxWidth:440, boxShadow:'0 8px 40px rgba(0,0,0,0.18)' }}>
              <h3 style={{ margin:'0 0 4px', fontSize:16, fontWeight:700, color:'#DC2626' }}>Delete / Skip Step</h3>
              <p style={{ margin:'0 0 16px', fontSize:12, color:'#64748B' }}>Select a future step to remove from the pipeline.</p>

              <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#64748B', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Select Step</label>
              <StyledSelect
                value={deleteStepId}
                onChange={val => setDeleteStepId(val)}
                placeholder="Choose a step…"
                options={allDeletable}
              />
              {deleteStepId && (() => {
                const chosen = allDeletable.find(d => d.value === deleteStepId)
                return chosen ? <p style={{ fontSize:11, color:'#64748B', margin:'4px 0 16px' }}>{chosen.sub}</p> : null
              })()}
              {!deleteStepId && <div style={{ marginBottom:16 }} />}

              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button onClick={() => { setDeleteStepModal(false); setDeleteStepId('') }}
                  style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #E2E8F0', background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', color:'#64748B' }}>
                  Cancel
                </button>
                <button disabled={!deleteStepId || customStepLoading}
                  onClick={async () => {
                    if (deleteStepId.startsWith('fixed:')) {
                      const stepKey = deleteStepId.replace('fixed:', '')
                      try {
                        setCustomStepLoading(true)
                        await api.post(`/sales-tax-tasks/${selectedPipe.id}/skip-step`, { stepKey })
                        await refreshPipe(selectedPipe.id); showToast('Step removed from pipeline')
                        setDeleteStepId(''); setDeleteStepModal(false)
                      } catch (e:any) { showToast(e?.response?.data?.message ?? 'Failed', false) }
                      finally { setCustomStepLoading(false) }
                    } else {
                      const csId = deleteStepId.replace('custom:', '')
                      await handleDeleteCustomStep(csId)
                      setDeleteStepId(''); setDeleteStepModal(false)
                    }
                  }}
                  style={{ padding:'8px 20px', borderRadius:8, border:'none', cursor:'pointer', background:'#DC2626', color:'#fff', fontSize:13, fontWeight:700, opacity: (!deleteStepId || customStepLoading) ? 0.5 : 1 }}>
                  {customStepLoading ? 'Removing…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Send Back modal */}
      {sendBackModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:24, width:'100%', maxWidth:420, boxShadow:'0 8px 40px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin:'0 0 4px', fontSize:16, fontWeight:900, color:'#D62828', fontFamily:"'Aptos',sans-serif" }}>Send Back to Trainee</h3>
            <p style={{ margin:'0 0 16px', fontSize:12, color:P.textMuted, fontFamily:"'Aptos',sans-serif" }}>A reason is required. The trainee will see this comment.</p>
            <textarea value={sendBackComment} onChange={e => setSendBackComment(e.target.value)} rows={4} placeholder="Explain what needs to be fixed…" style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:8, border:`1px solid ${P.border}`, fontSize:13, fontFamily:"'Aptos',sans-serif", outline:'none', resize:'none', marginBottom:16 }} />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => { setSendBackModal(false); setSendBackComment('') }} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${P.border}`, background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Aptos',sans-serif", color:P.textLabel }}>Cancel</button>
              <button onClick={handleManagerSendBack} disabled={actionLoading || !sendBackComment.trim()} style={{ padding:'8px 18px', borderRadius:8, border:'none', cursor:'pointer', background:'#D62828', color:'#fff', fontSize:13, fontWeight:700, fontFamily:"'Aptos',sans-serif", opacity:(actionLoading || !sendBackComment.trim()) ? 0.6 : 1 }}>
                {actionLoading ? 'Sending…' : 'Send Back'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin: Revert to incomplete confirm */}
      {adminRevertConfirm && selectedPipe && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:24, width:'100%', maxWidth:380, boxShadow:'0 8px 40px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin:'0 0 8px', fontSize:16, fontWeight:900, color:'#D97706', fontFamily:"'Aptos',sans-serif" }}>Mark as Incomplete?</h3>
            <p style={{ margin:'0 0 20px', fontSize:13, color:P.textMuted, fontFamily:"'Aptos',sans-serif", lineHeight:1.5 }}>
              This will revert the task back to <strong>Data Collection</strong> stage. All step history will be kept but the task will become active again.
            </p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setAdminRevertConfirm(false)} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${P.border}`, background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Aptos',sans-serif", color:P.textLabel }}>Cancel</button>
              <button onClick={handleAdminRevert} disabled={adminActionLoading} style={{ padding:'8px 18px', borderRadius:8, border:'none', cursor:'pointer', background:'#D97706', color:'#fff', fontSize:13, fontWeight:700, fontFamily:"'Aptos',sans-serif", opacity:adminActionLoading ? 0.6 : 1 }}>
                {adminActionLoading ? 'Reverting…' : 'Yes, Mark Incomplete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FBR: completedOnly / incompleteOnly view modal */}
      {(completedOnly || incompleteOnly) && selectedFbr && (
        <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ width:'min(960px,95vw)', height:'90vh', background:'#f7f8fa', borderRadius:16, overflow:'hidden', display:'flex', flexDirection:'column', position:'relative', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <button onClick={() => setSelectedFbr(null)}
              style={{ position:'absolute', top:12, right:12, zIndex:10, width:30, height:30, borderRadius:8, border:'none', cursor:'pointer', background:'#F1F5F9', color:'#64748B', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.1)' }}>
              <svg width={12} height={12} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div style={{ flex:1, overflowY:'auto' }}>
              <FbrCaseDetail
                case={selectedFbr}
                onUpdated={(updated: any) => setSelectedFbr(updated)}
                onReload={() => {
                  fetchFbrCases()
                  api.get(`/fbr/cases/${selectedFbr.id}`).then(r => {
                    const d = r.data?.data ?? r.data
                    if (d) setSelectedFbr(d)
                  }).catch(() => {})
                }}
                onMarkIncomplete={canMarkIncomplete ? () => setFbrRevertConfirm(true) : undefined}
                onDelete={canDeleteTask ? () => setFbrDeleteConfirm(true) : undefined}
              />
            </div>
          </div>
        </div>
      )}

      {/* FBR: Mark Incomplete confirm */}
      {fbrRevertConfirm && selectedFbr && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:24, width:'100%', maxWidth:380, boxShadow:'0 8px 40px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin:'0 0 8px', fontSize:16, fontWeight:900, color:'#D97706', fontFamily:"'Aptos',sans-serif" }}>Mark as Incomplete?</h3>
            <p style={{ margin:'0 0 20px', fontSize:13, color:P.textMuted, fontFamily:"'Aptos',sans-serif", lineHeight:1.5 }}>
              This will reopen the case back to <strong>Notice</strong> stage. All history will be kept.
            </p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setFbrRevertConfirm(false)} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${P.border}`, background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Aptos',sans-serif", color:P.textLabel }}>Cancel</button>
              <button onClick={handleFbrReopen} disabled={fbrActionLoading} style={{ padding:'8px 18px', borderRadius:8, border:'none', cursor:'pointer', background:'#D97706', color:'#fff', fontSize:13, fontWeight:700, fontFamily:"'Aptos',sans-serif", opacity:fbrActionLoading ? 0.6 : 1 }}>
                {fbrActionLoading ? 'Reverting…' : 'Yes, Mark Incomplete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FBR: Delete case confirm */}
      {fbrDeleteConfirm && selectedFbr && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:24, width:'100%', maxWidth:380, boxShadow:'0 8px 40px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin:'0 0 8px', fontSize:16, fontWeight:900, color:'#DC2626', fontFamily:"'Aptos',sans-serif" }}>Delete Case?</h3>
            <p style={{ margin:'0 0 20px', fontSize:13, color:P.textMuted, fontFamily:"'Aptos',sans-serif", lineHeight:1.5 }}>
              This will <strong>permanently delete</strong> this case and all its history. This action cannot be undone.
            </p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setFbrDeleteConfirm(false)} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${P.border}`, background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Aptos',sans-serif", color:P.textLabel }}>Cancel</button>
              <button onClick={handleFbrDelete} disabled={fbrActionLoading} style={{ padding:'8px 18px', borderRadius:8, border:'none', cursor:'pointer', background:'#DC2626', color:'#fff', fontSize:13, fontWeight:700, fontFamily:"'Aptos',sans-serif", opacity:fbrActionLoading ? 0.6 : 1 }}>
                {fbrActionLoading ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gen: Delete task confirm */}
      {genDeleteConfirm && selectedGen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:24, width:'100%', maxWidth:380, boxShadow:'0 8px 40px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin:'0 0 8px', fontSize:16, fontWeight:900, color:'#DC2626', fontFamily:"'Aptos',sans-serif" }}>Delete Task?</h3>
            <p style={{ margin:'0 0 20px', fontSize:13, color:P.textMuted, fontFamily:"'Aptos',sans-serif", lineHeight:1.5 }}>
              This will <strong>permanently delete</strong> &quot;{selectedGen.title}&quot; and all its steps. This action cannot be undone.
            </p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setGenDeleteConfirm(false)} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${P.border}`, background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Aptos',sans-serif", color:P.textLabel }}>Cancel</button>
              <button onClick={handleGenDelete} disabled={genActLoading} style={{ padding:'8px 18px', borderRadius:8, border:'none', cursor:'pointer', background:'#DC2626', color:'#fff', fontSize:13, fontWeight:700, fontFamily:"'Aptos',sans-serif", opacity:genActLoading ? 0.6 : 1 }}>
                {genActLoading ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin: Delete task confirm */}
      {adminDeleteConfirm && selectedPipe && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:24, width:'100%', maxWidth:380, boxShadow:'0 8px 40px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin:'0 0 8px', fontSize:16, fontWeight:900, color:'#DC2626', fontFamily:"'Aptos',sans-serif" }}>Delete Task?</h3>
            <p style={{ margin:'0 0 20px', fontSize:13, color:P.textMuted, fontFamily:"'Aptos',sans-serif", lineHeight:1.5 }}>
              This will <strong>permanently delete</strong> this task and all its history. This action cannot be undone.
            </p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setAdminDeleteConfirm(false)} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${P.border}`, background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Aptos',sans-serif", color:P.textLabel }}>Cancel</button>
              <button onClick={handleAdminDelete} disabled={adminActionLoading} style={{ padding:'8px 18px', borderRadius:8, border:'none', cursor:'pointer', background:'#DC2626', color:'#fff', fontSize:13, fontWeight:700, fontFamily:"'Aptos',sans-serif", opacity:adminActionLoading ? 0.6 : 1 }}>
                {adminActionLoading ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

