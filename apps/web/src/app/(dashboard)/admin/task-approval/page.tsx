import TasksRouter from '@/components/tasks/TasksRouter'
export default function Page() {
  return <TasksRouter role="manager" defaultManagerView="approval" />
}
