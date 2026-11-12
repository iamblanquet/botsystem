import { notFound } from 'next/navigation';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { state } from '@/lib/server';
import SavedLauncherDemo from '@/components/saved-launcher-demo';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prueba local del botón flotante' };
export default async function ButtonDemo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireChatGPTUser('/demos/button/' + encodeURIComponent(id));
  const data = await state(user.userId), assistant = data.assistants.find(bot => bot.id === id);
  const company = assistant && data.companies.find(item => item.id === assistant.company_id);
  if (!assistant || !company) notFound();
  return <SavedLauncherDemo assistantId={id} companyName={company.name} theme={assistant.theme} />;
}
