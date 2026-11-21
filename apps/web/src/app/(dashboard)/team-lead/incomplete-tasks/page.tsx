import TasksRouter from '@/components/tasks/TasksRouter'
export default function Page() {
  return <TasksRouter role="team_lead" incompleteOnly={true} />
}
