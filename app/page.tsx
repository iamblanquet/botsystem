import { requireChatGPTUser } from '@/app/chatgpt-auth';
import Dashboard from '@/components/dashboard';
export const dynamic = 'force-dynamic';
export default async function Home() {
  await requireChatGPTUser('/');
  return <Dashboard />;
}
