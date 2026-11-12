import ChatWidget from '@/components/chat-widget';
import '../embed.css';
export const dynamic = 'force-dynamic';
export default async function Embed({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main className="embed-page"><ChatWidget assistantId={id} /></main>;
}
