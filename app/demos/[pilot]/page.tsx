import { notFound } from 'next/navigation';
import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { demoPilot } from '@/lib/server';
import PilotDemo from '@/components/pilot-demo';
export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ pilot: string }> }) {
  const { pilot } = await params;
  return { title: (pilot === 'manuel' ? 'Manuel Martínez' : 'Winetalia · La Cava') + ' · Demo local' };
}
export default async function Pilot({ params }: { params: Promise<{ pilot: string }> }) {
  const { pilot } = await params;
  if (pilot !== 'manuel' && pilot !== 'winetalia') notFound();
  const user = await requireChatGPTUser('/demos/' + pilot);
  const data = await demoPilot(user.userId, pilot);
  if (!data) return <main className="d-hub"><h1>Prepara primero este piloto.</h1><p>Activa la empresa y su asistente desde el panel para abrir su demo.</p><a className="d-solid-button" href="/">Abrir panel</a></main>;
  return <PilotDemo pilot={pilot} data={data} />;
}
