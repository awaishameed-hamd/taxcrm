'use client'

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Role } from '@ca-firm/shared'
import { useAuth, usePermission } from '@/contexts/AuthContext'
import api from '@/lib/api'
import { TaskFormModal } from '@/components/tasks/GeneralTasksPage'
import { getSocket } from '@/lib/socket'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

// ── Palette — exact match to Call Center CRM Sidebar.jsx ──────────────────────
const C = {
  bg:        '#E8EAED',
  bgActive:  '#E8EEF7',
  border:    '#E0DDD5',
  teal:      '#1E8496',
  tealDim:   'rgba(30,132,150,0.12)',
  gold:      '#D7A520',
  navy:      '#132E57',
  slate:     '#5C5C5C',
  gray:      '#808080',
  iconMuted: '#9FA7B2',
  white:     '#FFFFFF',
}

const LABEL_GRAD: Record<string, { border: string; icon: string }> = {
  dashboard:   { border: '#132E57', icon: '#1E8496' },
  clients:     { border: '#3A6B3A', icon: '#3A6B3A' },
  taxReturns:  { border: '#7B2D8E', icon: '#7B2D8E' },
  team:        { border: '#1E8496', icon: '#1E8496' },
  documents:   { border: '#3A6B3A', icon: '#3A6B3A' },
  reports:     { border: '#7B2D8E', icon: '#7B2D8E' },
  settings:    { border: '#7B2D8E', icon: '#7B2D8E' },
  messages:    { border: '#1E8496', icon: '#1E8496' },
  myAtt:       { border: '#CBB26A', icon: '#CBB26A' },
  attReport:   { border: '#132E57', icon: '#3A6B3A' },
  attApproval: { border: '#D7A520', icon: '#1E8496' },
  dailyAtt:    { border: '#C25A1F', icon: '#7B2D8E' },
  workingDays: { border: '#3A6B3A', icon: '#1E8496' },
  profile:     { border: '#CBB26A', icon: '#CBB26A' },
  tasks:          { border: '#C25A1F', icon: '#C25A1F' },
  taskApproval:   { border: '#3A6B3A', icon: '#3A6B3A' },
  taxSummary:     { border: '#7B2D8E', icon: '#7B2D8E' },
  completedTasks: { border: '#0D9488', icon: '#0D9488' },
  notices:        { border: '#DC2626', icon: '#DC2626' },
  myLeaves:       { border: '#D7A520', icon: '#D7A520' },
}

const ICONS: Record<string, string> = {
  dashboard:
    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  clients:
    'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z',
  taxReturns:
    'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  team:
    'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  documents:
    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  reports:
    'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  settings:
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  messages:
    'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  myAtt:
    'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  attReport:
    'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  attApproval:
    'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  dailyAtt:
    'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
  workingDays:
    'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z',
  profile:
    'M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z',
  tasks:
    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  taxSummary:
    'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  completedTasks:
    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l2 2 4-4',
  taskApproval:
    'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  notices:
    'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  logout:
    'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
  myLeaves:
    'M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0z',
}

interface NavItem { label: string; href: string; icon: string; key: string; permission?: string }

const NAV: Record<string, NavItem[]> = {
  [Role.ADMIN]: [
    { label: 'Dashboard',           href: '/admin/dashboard',        icon: 'dashboard',      key: 'dashboard'      },
    { label: 'Clients',             href: '/admin/clients',          icon: 'clients',        key: 'clients'        },
    { label: 'Tax Summary',         href: '/admin/tax-summary',      icon: 'taxSummary',     key: 'taxSummary'     },
    { label: 'Files',               href: '/admin/documents',        icon: 'documents',      key: 'documents'      },
    { label: 'Tasks',               href: '/admin/tasks',            icon: 'tasks',          key: 'tasks'          },
    { label: 'Completed Tasks',     href: '/admin/completed-tasks',  icon: 'completedTasks', key: 'completedTasks' },
    { label: 'Incomplete Tasks',    href: '/admin/incomplete-tasks', icon: 'tasks',          key: 'incompleteTasks'},
    { label: 'Task Approval',       href: '/admin/task-approval',    icon: 'taskApproval',   key: 'taskApproval'   },
    { label: 'My Team',             href: '/admin/team',             icon: 'team',           key: 'team'           },
    { label: 'Chats',               href: '/admin/messages',         icon: 'messages',       key: 'messages'       },
    { label: 'My Attendance',       href: '/admin/attendance',       icon: 'myAtt',          key: 'myAtt'          },
    { label: 'Attendance Report',   href: '/admin/att-report',       icon: 'attReport',      key: 'attReport'      },
    { label: 'Attendance Approval', href: '/admin/att-approval',     icon: 'attApproval',    key: 'attApproval'    },
    { label: 'Daily Attendance',    href: '/admin/daily-attendance', icon: 'dailyAtt',       key: 'dailyAtt'       },
    { label: 'Working Days',        href: '/admin/working-days',     icon: 'workingDays',    key: 'workingDays'    },
    { label: 'Settings',            href: '/admin/settings',         icon: 'settings',       key: 'settings'       },
    { label: 'My Profile',          href: '/admin/profile',          icon: 'profile',        key: 'profile'        },
  ],
  [Role.PARTNER]: [
    { label: 'Dashboard',           href: '/partner/dashboard',        icon: 'dashboard',      key: 'dashboard',      permission: 'dashboard'           },
    { label: 'Clients',             href: '/partner/clients',          icon: 'clients',        key: 'clients',        permission: 'clients'             },
    { label: 'Tax Summary',         href: '/partner/tax-summary',      icon: 'taxSummary',     key: 'taxSummary',     permission: 'tax_summary'         },
    { label: 'Files',               href: '/partner/documents',        icon: 'documents',      key: 'documents'                                          },
    { label: 'Tasks',               href: '/partner/tasks',            icon: 'tasks',          key: 'tasks',          permission: 'tasks'               },
    { label: 'Completed Tasks',     href: '/partner/completed-tasks',  icon: 'completedTasks', key: 'completedTasks', permission: 'completed_tasks'     },
    { label: 'Incomplete Tasks',    href: '/partner/incomplete-tasks', icon: 'tasks',          key: 'incompleteTasks',permission: 'incomplete_tasks'    },
    { label: 'Task Approval',       href: '/partner/task-approval',    icon: 'taskApproval',   key: 'taskApproval',   permission: 'task_approval'       },
    { label: 'My Team',             href: '/partner/team',             icon: 'team',           key: 'team',           permission: 'team'                },
    { label: 'Chats',               href: '/partner/messages',         icon: 'messages',       key: 'messages',       permission: 'messages'            },
    { label: 'My Attendance',       href: '/partner/attendance',       icon: 'myAtt',          key: 'myAtt',          permission: 'my_attendance'       },
    { label: 'Attendance Report',   href: '/partner/att-report',       icon: 'attReport',      key: 'attReport',      permission: 'attendance_report'   },
    { label: 'Attendance Approval', href: '/partner/att-approval',     icon: 'attApproval',    key: 'attApproval',    permission: 'attendance_approval' },
    { label: 'Daily Attendance',    href: '/partner/daily-attendance', icon: 'dailyAtt',       key: 'dailyAtt',       permission: 'daily_attendance'    },
    { label: 'Working Days',        href: '/partner/working-days',     icon: 'workingDays',    key: 'workingDays',    permission: 'working_days'        },
    { label: 'Settings',            href: '/partner/settings',         icon: 'settings',       key: 'settings'                                          },
    { label: 'My Profile',          href: '/partner/profile',          icon: 'profile',        key: 'profile',        permission: 'my_profile'          },
  ],
  [Role.MANAGER]: [
    { label: 'Dashboard',           href: '/manager/dashboard',        icon: 'dashboard',      key: 'dashboard',      permission: 'dashboard'           },
    { label: 'Clients',             href: '/manager/clients',          icon: 'clients',        key: 'clients',        permission: 'clients'             },
    { label: 'Tax Summary',         href: '/manager/tax-summary',      icon: 'taxSummary',     key: 'taxSummary',     permission: 'tax_summary'         },
    { label: 'Files',               href: '/manager/documents',        icon: 'documents',      key: 'documents'                                          },
    { label: 'Tasks',               href: '/manager/tasks',            icon: 'tasks',          key: 'tasks',          permission: 'tasks'               },
    { label: 'Completed Tasks',     href: '/manager/completed-tasks',  icon: 'completedTasks', key: 'completedTasks', permission: 'completed_tasks'     },
    { label: 'Incomplete Tasks',    href: '/manager/incomplete-tasks', icon: 'tasks',          key: 'incompleteTasks',permission: 'incomplete_tasks'    },
    { label: 'Task Approval',       href: '/manager/task-approval',    icon: 'taskApproval',   key: 'taskApproval',   permission: 'task_approval'       },
    { label: 'My Team',             href: '/manager/team',             icon: 'team',           key: 'team',           permission: 'team'                },
    { label: 'Chats',               href: '/manager/messages',         icon: 'messages',       key: 'messages',       permission: 'messages'            },
    { label: 'My Attendance',       href: '/manager/attendance',       icon: 'myAtt',          key: 'myAtt',          permission: 'my_attendance'       },
    { label: 'My Leaves',           href: '/manager/my-leaves',        icon: 'myLeaves',       key: 'myLeaves'                                                    },
    { label: 'Attendance Report',   href: '/manager/att-report',       icon: 'attReport',      key: 'attReport',      permission: 'attendance_report'   },
    { label: 'Attendance Approval', href: '/manager/att-approval',     icon: 'attApproval',    key: 'attApproval',    permission: 'attendance_approval' },
    { label: 'Daily Attendance',    href: '/manager/daily-attendance', icon: 'dailyAtt',       key: 'dailyAtt',       permission: 'daily_attendance'    },
    { label: 'Working Days',        href: '/manager/working-days',     icon: 'workingDays',    key: 'workingDays',    permission: 'working_days'        },
    { label: 'My Profile',          href: '/manager/profile',          icon: 'profile',        key: 'profile',        permission: 'my_profile'          },
  ],
  [Role.TEAM_LEAD]: [
    { label: 'Dashboard',           href: '/team-lead/dashboard',        icon: 'dashboard',      key: 'dashboard',      permission: 'dashboard'           },
    { label: 'Clients',             href: '/team-lead/clients',          icon: 'clients',        key: 'clients',        permission: 'clients'             },
    { label: 'Tax Summary',         href: '/team-lead/tax-summary',      icon: 'taxSummary',     key: 'taxSummary',     permission: 'tax_summary'         },
    { label: 'Files',               href: '/team-lead/documents',        icon: 'documents',      key: 'documents'                                          },
    { label: 'Tasks',               href: '/team-lead/tasks',            icon: 'tasks',          key: 'tasks',          permission: 'tasks'               },
    { label: 'Completed Tasks',     href: '/team-lead/completed-tasks',  icon: 'completedTasks', key: 'completedTasks', permission: 'completed_tasks'     },
    { label: 'Incomplete Tasks',    href: '/team-lead/incomplete-tasks', icon: 'tasks',          key: 'incompleteTasks',permission: 'incomplete_tasks'    },
    { label: 'Task Approval',       href: '/team-lead/task-approval',    icon: 'taskApproval',   key: 'taskApproval',   permission: 'task_approval'       },
    { label: 'My Team',             href: '/team-lead/team',             icon: 'team',           key: 'team',           permission: 'team'                },
    { label: 'Chats',               href: '/team-lead/messages',         icon: 'messages',       key: 'messages',       permission: 'messages'            },
    { label: 'My Attendance',       href: '/team-lead/attendance',       icon: 'myAtt',          key: 'myAtt',          permission: 'my_attendance'       },
    { label: 'My Leaves',           href: '/team-lead/my-leaves',        icon: 'myLeaves',       key: 'myLeaves'                                                    },
    { label: 'Attendance Report',   href: '/team-lead/att-report',       icon: 'attReport',      key: 'attReport',      permission: 'attendance_report'   },
    { label: 'Attendance Approval', href: '/team-lead/att-approval',     icon: 'attApproval',    key: 'attApproval',    permission: 'attendance_approval' },
    { label: 'Daily Attendance',    href: '/team-lead/daily-attendance', icon: 'dailyAtt',       key: 'dailyAtt',       permission: 'daily_attendance'    },
    { label: 'Working Days',        href: '/team-lead/working-days',     icon: 'workingDays',    key: 'workingDays',    permission: 'working_days'        },
    { label: 'My Profile',          href: '/team-lead/profile',          icon: 'profile',        key: 'profile',        permission: 'my_profile'          },
  ],
  [Role.TRAINEE]: [
    { label: 'Dashboard',        href: '/trainee/dashboard',         icon: 'dashboard',      key: 'dashboard',      permission: 'dashboard'      },
    { label: 'My Clients',       href: '/trainee/clients',           icon: 'clients',        key: 'clients',        permission: 'clients'        },
    { label: 'Tax Summary',      href: '/trainee/tax-summary',       icon: 'taxSummary',     key: 'taxSummary',     permission: 'tax_summary'    },
    { label: 'Files',            href: '/trainee/documents',         icon: 'documents',      key: 'documents'                                      },
    { label: 'Tasks',            href: '/trainee/tasks',             icon: 'tasks',          key: 'tasks',          permission: 'tasks'          },
    { label: 'Completed Tasks',  href: '/trainee/completed-tasks',   icon: 'completedTasks', key: 'completedTasks', permission: 'completed_tasks'},
    { label: 'Chats',            href: '/trainee/messages',          icon: 'messages',       key: 'messages',       permission: 'messages'       },
    { label: 'My Attendance',    href: '/trainee/attendance',        icon: 'myAtt',          key: 'myAtt',          permission: 'my_attendance'  },
    { label: 'My Leaves',        href: '/trainee/my-leaves',         icon: 'myLeaves',       key: 'myLeaves'                                       },
    { label: 'My Profile',       href: '/trainee/profile',           icon: 'profile',        key: 'profile',        permission: 'my_profile'     },
  ],
  [Role.CLIENT]: [
    { label: 'Dashboard',  href: '/client/dashboard',  icon: 'dashboard', key: 'dashboard' },
    { label: 'Chats',      href: '/client/messages',   icon: 'messages',  key: 'messages'  },
    { label: 'My Profile',   href: '/client/profile',    icon: 'profile',   key: 'profile'   },
  ],
}

const ATTENDANCE_KEYS = ['myAtt', 'myLeaves', 'attReport', 'attApproval', 'dailyAtt', 'workingDays']

const ROLE_LABELS: Record<string, string> = {
  ADMIN:     'Admin',
  PARTNER:   'Partner',
  MANAGER:   'Manager',
  TEAM_LEAD: 'Team Lead',
  TRAINEE:   'Trainee',
  CLIENT:    'Client',
}

const AVATAR_KEY_PREFIX = 'ca_firm_avatar_'

interface SidebarProps { collapsed: boolean; onToggle: () => void }

const BLANK_FORM = { title: '', clientId: '', priority: 'MEDIUM', dueDate: '', assignedToId: '', description: '', taxType: '', incomeTaxKind: 'return', periodMonth: new Date().getMonth() + 1, periodYear: new Date().getFullYear(), authority: 'FBR', returnType: 'ORIGINAL', fbrEntryPoint: 'FRESH_NOTICE', fbrTaxType: 'INCOME_TAX', fbrTaxYear: '', fbrNoticeSection: '', fbrNoticeNumber: '', fbrTaxTypeOther: '' }

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, logout, permissions } = useAuth()
  const pathname                      = usePathname()
  const fileRef          = useRef<HTMLInputElement>(null)

  const avatarKey = `${AVATAR_KEY_PREFIX}${user?.id ?? ''}`
  const [avatar, setAvatar] = useState<string | null>(null)

  useEffect(() => {
    setAvatar(localStorage.getItem(avatarKey))
  }, [avatarKey])

  // ── Attendance flyout menu ────────────────────────────────────────────────
  const attTriggerRef  = useRef<HTMLDivElement>(null)
  const attPanelRef    = useRef<HTMLDivElement>(null)
  const attCloseTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showAttMenu, setShowAttMenu] = useState(false)
  const [attMenuPos,  setAttMenuPos]  = useState({ top: 0, left: 0 })

  const openAttMenu = useCallback(() => {
    if (attCloseTimer.current) { clearTimeout(attCloseTimer.current); attCloseTimer.current = null }
    const rect = attTriggerRef.current?.getBoundingClientRect()
    if (rect) setAttMenuPos({ top: rect.top, left: rect.right + 8 })
    setShowAttMenu(true)
  }, [])

  const scheduleCloseAttMenu = useCallback(() => {
    attCloseTimer.current = setTimeout(() => setShowAttMenu(false), 150)
  }, [])

  // Used when re-entering the already-open panel — cancels the pending close
  // WITHOUT recomputing position, so the flip-to-fit correction below doesn't get undone.
  const cancelCloseAttMenu = useCallback(() => {
    if (attCloseTimer.current) { clearTimeout(attCloseTimer.current); attCloseTimer.current = null }
  }, [])

  useEffect(() => { setShowAttMenu(false) }, [pathname])

  // ── New Task modal state ──────────────────────────────────────────────────
  const [showNewTask,      setShowNewTask]      = useState(false)
  const [ntForm,           setNtForm]           = useState<any>({ ...BLANK_FORM })
  const [ntClients,        setNtClients]        = useState<any[]>([])
  const [ntClientsLoading, setNtClientsLoading] = useState(false)
  const [ntUsers,          setNtUsers]          = useState<any[]>([])
  const [ntSaving,         setNtSaving]         = useState(false)
  const [ntToast,          setNtToast]          = useState<{ msg: string; ok: boolean } | null>(null)

  const canAssignOthers = user?.role !== Role.TRAINEE

  // ── Notifications ─────────────────────────────────────────────────────────
  const [notifs,        setNotifs]        = useState<any[]>([])
  const [unreadCount,   setUnreadCount]   = useState(0)
  const [showNotifs,    setShowNotifs]    = useState(false)
  const [notifFilter,   setNotifFilter]   = useState<'all' | 'unread'>('all')

  useEffect(() => {
    if (!user) return
    api.get('/notifications').then(r => {
      const list = r.data?.data ?? r.data ?? []
      setNotifs(Array.isArray(list) ? list.slice(0, 20) : [])
      setUnreadCount(Array.isArray(list) ? list.filter((n: any) => !n.isRead).length : 0)
    }).catch(() => {})

    const sock = getSocket()
    const onNotif = (data: any) => {
      setUnreadCount(c => c + 1)
      setNotifs(prev => [{
        id: Date.now().toString(),
        title: data.title ?? 'Notification',
        body: data.body ?? '',
        isRead: false,
        createdAt: new Date().toISOString(),
      }, ...prev].slice(0, 20))
    }
    sock.on('notification', onNotif)
    return () => { sock.off('notification', onNotif) }
  }, [user?.id])

  const markAllRead = async () => {
    await api.patch('/notifications/read-all').catch(() => {})
    setNotifs(prev => prev.map(n => ({ ...n, isRead: true })))
    setUnreadCount(0)
  }

  const deleteNotif = async (id: string) => {
    await api.delete(`/notifications/${id}`).catch(() => {})
    setNotifs(prev => {
      const target = prev.find(n => n.id === id)
      if (target && !target.isRead) setUnreadCount(c => Math.max(0, c - 1))
      return prev.filter(n => n.id !== id)
    })
  }

  const deleteAllNotifs = async () => {
    await api.delete('/notifications/all').catch(() => {})
    setNotifs([])
    setUnreadCount(0)
  }

  // ── Sidebar nav badges: Tasks, Task Approval, Attendance Approval, Chats ────
  const [navCounts, setNavCounts] = useState<{ tasks: number; taskApproval: number; attApproval: number; messages: number }>({
    tasks: 0, taskApproval: 0, attApproval: 0, messages: 0,
  })

  const fetchNavCounts = useCallback(() => {
    if (!user) return
    if (user.role !== Role.CLIENT) {
      api.get('/sales-tax-tasks/summary-counts', { params: { view: 'my' } }).then(r => {
        const d = r.data?.data ?? r.data
        const total = (d.SALES_TAX ?? 0) + (d.INCOME_TAX ?? 0) + (d.WHT ?? 0) + (d.NOTICES ?? 0) + (d.GENERAL ?? 0)
        setNavCounts(c => ({ ...c, tasks: total }))
      }).catch(() => {})
      if (user.role !== Role.TRAINEE) {
        api.get('/sales-tax-tasks/summary-counts', { params: { view: 'approval' } }).then(r => {
          const d = r.data?.data ?? r.data
          const total = (d.SALES_TAX ?? 0) + (d.INCOME_TAX ?? 0) + (d.WHT ?? 0) + (d.NOTICES ?? 0)
          setNavCounts(c => ({ ...c, taskApproval: total }))
        }).catch(() => {})
        api.get('/attendance/pending-count').then(r => {
          const d = r.data?.data ?? r.data
          setNavCounts(c => ({ ...c, attApproval: typeof d === 'number' ? d : (d.count ?? 0) }))
        }).catch(() => {})
      }
    }
    api.get('/chat/unread-count').then(r => {
      const d = r.data?.data ?? r.data
      setNavCounts(c => ({ ...c, messages: typeof d === 'number' ? d : (d.count ?? 0) }))
    }).catch(() => {})
  }, [user])

  useEffect(() => { fetchNavCounts() }, [fetchNavCounts])
  useAutoRefresh(fetchNavCounts)

  const openNewTask = useCallback(async () => {
    setNtForm({ ...BLANK_FORM })
    setNtClients([])
    setNtUsers([])
    setNtClientsLoading(true)
    setShowNewTask(true)
    api.get('/tasks/clients')
      .then(r => { const d = r.data?.data ?? r.data; setNtClients(Array.isArray(d) ? d : []) })
      .catch(() => {})
      .finally(() => setNtClientsLoading(false))
    api.get('/tasks/assignable-users')
      .then(r => {
        const raw = r.data?.data ?? r.data
        const list = Array.isArray(raw) ? raw : []
        const sorted = [
          ...list.filter((u: any) => u.id === user?.id),
          ...list.filter((u: any) => u.id !== user?.id),
        ]
        setNtUsers(sorted)
      })
      .catch(() => {})
  }, [user?.id])

  const submitNewTask = useCallback(async () => {
    const isFbrNotice = ntForm.taxType === 'notices'
    const effectiveAssignedToId = canAssignOthers ? ntForm.assignedToId : user?.id
    if (!ntForm.clientId) return
    if (!isFbrNotice && !effectiveAssignedToId) return

    // FBR case (Notices & Appeals)
    if (ntForm.taxType === 'notices') {
      setNtSaving(true)
      try {
        await api.post('/fbr/cases', {
          clientId:     ntForm.clientId,
          entryPoint:   ntForm.fbrEntryPoint || 'FRESH_NOTICE',
          taxType:       ntForm.fbrTaxType === 'OTHER' ? (ntForm.fbrTaxTypeOther || 'OTHER') : (ntForm.fbrTaxType || 'INCOME_TAX'),
          taxYear:       ntForm.fbrTaxYear       || undefined,
          noticeSection: ntForm.fbrNoticeSection || undefined,
          noticeNumber:  ntForm.fbrNoticeNumber  || undefined,
          description:  ntForm.description   || undefined,
        })
        setShowNewTask(false)
        setNtToast({ msg: 'FBR case created!', ok: true })
        setTimeout(() => setNtToast(null), 3000)
      } catch (e: any) {
        setNtToast({ msg: e?.response?.data?.message ?? 'Failed to create case', ok: false })
        setTimeout(() => setNtToast(null), 3500)
      } finally { setNtSaving(false) }
      return
    }

    // Pipeline types: sales_tax, income_tax, wht — any role can hold the task
    const PIPELINE_TYPES = ['sales_tax', 'income_tax', 'wht']
    const isPipelineTask = PIPELINE_TYPES.includes(ntForm.taxType)

    if (!isPipelineTask && !ntForm.title.trim()) return

    // Due date is mandatory for every task
    if (!ntForm.dueDate) {
      setNtToast({ msg: 'Please select a due date for the task.', ok: false })
      setTimeout(() => setNtToast(null), 3000)
      return
    }

    setNtSaving(true)
    try {
      if (isPipelineTask) {
        const ttMap: Record<string, string> = { sales_tax: 'SALES_TAX', income_tax: 'INCOME_TAX', wht: 'WHT' }
        const taskType    = ttMap[ntForm.taxType] ?? 'SALES_TAX'
        const periodMonth = ntForm.taxType === 'income_tax'
          ? (ntForm.incomeTaxKind === 'advance_tax' ? Number(ntForm.periodMonth) : 0)
          : Number(ntForm.periodMonth)
        await api.post('/sales-tax-tasks', {
          clientId:     ntForm.clientId,
          traineeId:    effectiveAssignedToId ?? user?.id,
          periodMonth,
          periodYear:   Number(ntForm.periodYear),
          dueDate:      ntForm.dueDate || undefined,
          priority:     ntForm.priority || undefined,
          assignerNote: ntForm.description || undefined,
          taskType,
          ...(ntForm.taxType === 'sales_tax' ? { authority: ntForm.authority || 'FBR', returnType: ntForm.returnType || 'ORIGINAL' } : {}),
        })
      } else {
        await api.post('/tasks', {
          title:        ntForm.title.trim(),
          description:  ntForm.description || undefined,
          priority:     ntForm.priority,
          dueDate:      ntForm.dueDate || undefined,
          assignedToId: effectiveAssignedToId,
          taxType:      ntForm.taxType || 'income_tax',
          clientId:     ntForm.clientId,
        })
      }
      setShowNewTask(false)
      setNtToast({ msg: isPipelineTask ? `${ntForm.taxType === 'wht' ? 'WHT' : ntForm.taxType === 'income_tax' ? 'Income Tax' : 'Sales Tax'} task assigned!` : 'Task created!', ok: true })
      setTimeout(() => setNtToast(null), 3000)
    } catch (e: any) {
      setNtToast({ msg: e?.response?.data?.message ?? 'Failed to create task', ok: false })
      setTimeout(() => setNtToast(null), 3500)
    } finally { setNtSaving(false) }
  }, [ntForm, ntUsers, canAssignOthers, user?.id])

  const allNavItems = NAV[user?.role ?? ''] ?? []
  const hasAllPerms = (permissions as any)?.all === true

  // Filter items by permission — items without a permission key always show
  const navItems = allNavItems.filter(item => {
    if (!item.permission) return true
    if (hasAllPerms) return true
    return (permissions as Record<string, boolean>)[item.permission] === true
  }).filter(item => item.key !== 'myAtt' || user?.attendanceApplicable !== false)

  const attendanceSubItems = navItems.filter(item => ATTENDANCE_KEYS.includes(item.key))

  // Collapse the individual attendance items into a single grouped trigger, in place of the first one
  type RenderEntry = NavItem | { __group: true; items: NavItem[] }
  const renderList: RenderEntry[] = []
  let attGroupInserted = false
  for (const item of navItems) {
    if (ATTENDANCE_KEYS.includes(item.key)) {
      if (!attGroupInserted) {
        renderList.push({ __group: true, items: attendanceSubItems })
        attGroupInserted = true
      }
      continue
    }
    renderList.push(item)
  }

  const isAttActive = attendanceSubItems.some(si => pathname === si.href || pathname.startsWith(si.href + '/'))

  // Keep the panel fully on-screen: flip above the trigger when there isn't room below,
  // and clamp so it never runs off the top/bottom/right edge of the viewport.
  useLayoutEffect(() => {
    if (!showAttMenu) return
    const trigger = attTriggerRef.current
    const panel   = attPanelRef.current
    if (!trigger || !panel) return
    const margin  = 8
    const tRect   = trigger.getBoundingClientRect()
    const pHeight = panel.offsetHeight
    const pWidth  = panel.offsetWidth

    const spaceBelow = window.innerHeight - tRect.top - margin
    const spaceAbove = tRect.bottom - margin
    let top = tRect.top
    if (pHeight > spaceBelow && spaceAbove > spaceBelow) {
      top = tRect.bottom - pHeight
    }
    top = Math.min(Math.max(top, margin), Math.max(margin, window.innerHeight - pHeight - margin))

    let left = tRect.right + margin
    if (left + pWidth > window.innerWidth - margin) {
      left = tRect.left - pWidth - margin
    }
    left = Math.max(left, margin)

    setAttMenuPos(prev => (prev.top === top && prev.left === left ? prev : { top, left }))
  }, [showAttMenu, attendanceSubItems.length])

  const roleLabel = ROLE_LABELS[user?.role ?? ''] ?? user?.role ?? ''
  const initial   = user?.fullName?.charAt(0)?.toUpperCase() ?? '?'

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const b64 = reader.result as string
      localStorage.setItem(avatarKey, b64)
      setAvatar(b64)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleLogout() {
    await logout()
    window.location.href = '/login'
  }

  return (
    <aside
      style={{
        display:       'flex',
        flexDirection: 'column',
        minHeight:     '100vh',
        flexShrink:    0,
        overflow:      'hidden',
        background:    C.bg,
        width:         collapsed ? 0 : 256,
        transition:    'width 0.2s',
      }}
    >
      {/* ── Brand header ── */}
      <div style={{ display: 'flex', alignItems: 'center', height: 52, padding: '0 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, minWidth: 256 }}>
        <p style={{
          margin:        0,
          fontFamily:    "'Ethnocentric Rg', sans-serif",
          fontWeight:    300,
          fontSize:      '1.15rem',
          marginLeft:    '-6px',
          color:         C.navy,
          letterSpacing: '0.01em',
          whiteSpace:    'nowrap',
          lineHeight:    1,
        }}>
          ASIF ASSOCIATES
        </p>
      </div>

      {/* ── User badge ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0, minWidth: 256 }}>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
        <div onClick={() => fileRef.current?.click()} title="Change profile photo"
          style={{ position: 'relative', flexShrink: 0, cursor: 'pointer', width: 52, height: 52 }}>
          {avatar ? (
            <img src={avatar} alt="avatar" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: '50%', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', background: C.teal, color: C.white }}>
              {initial}
            </div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: C.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.fullName}
          </p>
          <p style={{ margin: 0, fontSize: 14, color: C.slate, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {roleLabel}
          </p>
        </div>
        <button onClick={onToggle} title="Hide sidebar"
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: 6, border: 0, background: 'transparent',
            color: C.gray, cursor: 'pointer', transition: 'color .2s, background .2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = C.navy; e.currentTarget.style.background = C.tealDim }}
          onMouseLeave={e => { e.currentTarget.style.color = C.gray; e.currentTarget.style.background = 'transparent' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* ── New Task quick button (all internal roles) ── */}
      {user?.role !== Role.CLIENT && (
        <div style={{ padding: '8px 12px 4px', minWidth: 256, flexShrink: 0 }}>
          <button onClick={openNewTask} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            width: '100%', padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: '#7EC8D0',
            color: '#132E57', fontFamily: "'Ethnocentric Rg', sans-serif", fontSize: 14, fontWeight: 300,
            letterSpacing: '0.06em', boxShadow: 'none',
            transition: 'opacity .15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <svg width={15} height={15} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Task
          </button>
        </div>
      )}

      {/* ── Navigation — flat list, exact font sizing ── */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 16px', minWidth: 256 }}>
        {renderList.map(entry => {
          if ('__group' in entry) {
            if (entry.items.length === 0) return null
            return (
              <div key="attendance-group" ref={attTriggerRef}
                onMouseEnter={openAttMenu} onMouseLeave={scheduleCloseAttMenu}
                onClick={openAttMenu}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '0.3rem 0.75rem', borderRadius: 8, marginBottom: 2,
                  fontSize: 16, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.03em',
                  transition: 'all .15s ease',
                  background: isAttActive || showAttMenu ? C.bgActive : 'transparent',
                  color:      isAttActive || showAttMenu ? C.navy : C.slate,
                  borderLeft: isAttActive ? `3px solid ${C.teal}` : '3px solid transparent',
                }}
              >
                <svg width={18} height={18} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke={isAttActive || showAttMenu ? C.teal : C.iconMuted} style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.myAtt} />
                </svg>
                <span style={{ flex: 1 }}>Attendance</span>
              </div>
            )
          }

          const item = entry
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const badgeCount = item.key === 'tasks' ? navCounts.tasks
            : item.key === 'taskApproval' ? navCounts.taskApproval
            : item.key === 'messages' ? navCounts.messages
            : 0
          return (
            <Link key={item.href} href={item.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0.3rem 0.75rem', borderRadius: 8, marginBottom: 2,
                fontSize: 16, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.03em',
                textDecoration: 'none', transition: 'all .15s ease',
                background: isActive ? C.bgActive : 'transparent',
                color:      isActive ? C.navy : C.slate,
                borderLeft: isActive ? `3px solid ${C.teal}` : '3px solid transparent',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = C.tealDim; e.currentTarget.style.color = C.navy } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.slate } }}
            >
              <svg width={18} height={18} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke={isActive ? C.teal : C.iconMuted} style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[item.icon] ?? ICONS.dashboard} />
              </svg>
              <span style={{ flex: 1 }}>{item.label}</span>
              {badgeCount > 0 && (
                <span style={{
                  minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px',
                  background: isActive ? C.teal : '#E53935', color: '#fff',
                  fontSize: 10.5, fontWeight: 700, lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>{badgeCount > 99 ? '99+' : badgeCount}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── Attendance flyout panel ── */}
      {showAttMenu && attendanceSubItems.length > 0 && (
        <div ref={attPanelRef}
          onMouseEnter={cancelCloseAttMenu} onMouseLeave={scheduleCloseAttMenu}
          style={{
            position: 'fixed', top: attMenuPos.top, left: attMenuPos.left, zIndex: 400,
            width: 220, background: '#fff', border: `1px solid ${C.border}`,
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', overflowX: 'hidden',
          }}
        >
          <div style={{ padding: '8px 14px 6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.gray, fontFamily: "'Aptos', 'Inter', sans-serif" }}>
            Attendance
          </div>
          {attendanceSubItems.map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href} onClick={() => setShowAttMenu(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 14px', textDecoration: 'none',
                  fontSize: 14, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.02em',
                  background: isActive ? C.bgActive : 'transparent',
                  color:      isActive ? C.navy : C.slate,
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = C.tealDim; e.currentTarget.style.color = C.navy } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.slate } }}
              >
                <svg width={16} height={16} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke={isActive ? C.teal : C.iconMuted} style={{ flexShrink: 0 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[item.icon] ?? ICONS.dashboard} />
                </svg>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.key === 'attApproval' && navCounts.attApproval > 0 && (
                  <span style={{
                    minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px',
                    background: isActive ? C.teal : '#E53935', color: '#fff',
                    fontSize: 10.5, fontWeight: 700, lineHeight: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>{navCounts.attApproval > 99 ? '99+' : navCounts.attApproval}</span>
                )}
              </Link>
            )
          })}
        </div>
      )}

      {/* ── Notifications bell + drop-up panel ── */}
      <div style={{ position: 'relative', padding: '0 12px', minWidth: 256, flexShrink: 0 }}>
        {/* Drop-up panel */}
        {showNotifs && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 12, right: 12, zIndex: 300,
            background: '#fff', border: `1px solid ${C.border}`,
            borderRadius: 10, maxHeight: 320, display: 'flex', flexDirection: 'column',
            boxShadow: '0 -8px 24px rgba(0,0,0,0.10)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 6px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.navy, fontFamily: "'Aptos', 'Inter', sans-serif" }}>Notifications</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} style={{ fontSize: 10, color: C.teal, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Aptos', 'Inter', sans-serif", padding: 0 }}>
                    Mark all read
                  </button>
                )}
                {notifs.length > 0 && (
                  <button onClick={deleteAllNotifs} style={{ fontSize: 10, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Aptos', 'Inter', sans-serif", padding: 0 }}>
                    Delete all
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, padding: '6px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              {(['all', 'unread'] as const).map(f => {
                const active = notifFilter === f
                return (
                  <button key={f} onClick={() => setNotifFilter(f)}
                    style={{
                      border: 0, borderRadius: 12, padding: '3px 10px', fontSize: 10.5, fontWeight: 700,
                      cursor: 'pointer', fontFamily: "'Aptos', 'Inter', sans-serif",
                      background: active ? C.tealDim : '#F1F5F9',
                      color: active ? C.teal : C.slate,
                    }}>
                    {f === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
                  </button>
                )
              })}
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {(() => {
                const filtered = notifFilter === 'unread' ? notifs.filter(n => !n.isRead) : notifs
                if (filtered.length === 0) {
                  return (
                    <p style={{ margin: 0, padding: '14px 12px', fontSize: 12, color: C.gray, fontFamily: "'Aptos', 'Inter', sans-serif", textAlign: 'center' }}>
                      {notifFilter === 'unread' ? 'No unread notifications' : 'No notifications'}
                    </p>
                  )
                }
                return filtered.map(n => (
                <div key={n.id} style={{
                  position: 'relative', padding: '8px 28px 8px 12px', borderBottom: `1px solid #f0f0f0`,
                  background: n.isRead ? 'transparent' : '#EFF6FF',
                  borderLeft: `3px solid ${n.isRead ? 'transparent' : C.teal}`,
                }}>
                  <button onClick={() => deleteNotif(n.id)} title="Delete notification"
                    style={{
                      position: 'absolute', top: 6, right: 6, width: 18, height: 18,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: 0, borderRadius: 4, background: 'transparent', color: C.gray,
                      cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.gray }}>
                    ×
                  </button>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.navy, fontFamily: "'Aptos', 'Inter', sans-serif", textAlign: 'left' }}>{n.title}</p>
                  <p style={{ margin: 0, fontSize: 11, color: C.slate, fontFamily: "'Aptos', 'Inter', sans-serif", lineHeight: 1.4, marginTop: 1, textAlign: 'left' }}>{n.body}</p>
                  <p style={{ margin: 0, fontSize: 10, color: C.gray, fontFamily: "'Aptos', 'Inter', sans-serif", marginTop: 2, textAlign: 'left' }}>
                    {new Date(n.createdAt).toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                  </p>
                </div>
                ))
              })()}
            </div>
          </div>
        )}

        {/* Bell button row */}
        <button onClick={() => setShowNotifs(v => !v)} title="Notifications"
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '0.5rem 0.75rem', borderRadius: 8, border: 0,
            background: showNotifs ? C.tealDim : 'transparent',
            cursor: 'pointer', fontSize: 16,
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.03em',
            color: showNotifs ? C.teal : C.slate,
            transition: 'background .15s, color .15s', position: 'relative',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.tealDim; e.currentTarget.style.color = C.teal }}
          onMouseLeave={e => { if (!showNotifs) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.slate } }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <svg width={18} height={18} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -6,
                minWidth: 14, height: 14, borderRadius: 7,
                background: '#E53935', color: '#fff',
                fontSize: 9, fontWeight: 700, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
              }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </div>
          Notifications
        </button>
      </div>

      {/* ── Logout ── */}
      <div style={{ padding: '4px 12px 16px', minWidth: 256 }}>
        <button onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '0.625rem 0.75rem', borderRadius: 8, border: 0, background: 'transparent', cursor: 'pointer',
            fontSize: 16, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, letterSpacing: '0.03em', color: C.slate,
            transition: 'background .15s, color .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(214,40,40,0.1)'; e.currentTarget.style.color = '#D62828' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.slate }}>
          <svg width={18} height={18} fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" style={{ flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.logout} />
          </svg>
          Sign Out
        </button>
      </div>
      {/* ── Toast ── */}
      {ntToast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 9999,
          background: ntToast.ok ? '#3A6B3A' : '#D62828', color: '#fff',
          padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
          fontFamily: "'Aptos', sans-serif", boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>{ntToast.msg}</div>
      )}

      {/* ── New Task modal ── */}
      {showNewTask && (
        <TaskFormModal
          title="New Task"
          form={ntForm}
          setForm={setNtForm}
          clients={ntClients}
          clientsLoading={ntClientsLoading}
          assignableUsers={ntUsers}
          canAssignOthers={canAssignOthers}
          saving={ntSaving}
          currentUserId={user?.id}
          showSalesTax={true}
          onClose={() => setShowNewTask(false)}
          onSubmit={submitNewTask}
          submitLabel="Create Task"
        />
      )}
    </aside>
  )
}
