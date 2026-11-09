export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const script = `(function(){
    var s=document.currentScript,id=s&&s.dataset.assistantId;if(!id)return;
    var host=${JSON.stringify(origin)}, inline=s.dataset.container, frame=document.createElement('iframe');
    frame.src=host+'/embed/'+encodeURIComponent(id);frame.title='Asistente de atención';frame.setAttribute('allow','');frame.style.cssText='border:0;width:100%;height:100%;border-radius:inherit;background:#fff';
    var panel=document.createElement('div');panel.appendChild(frame);
    if(inline){var container=document.querySelector(inline);if(!container)return;panel.style.cssText='width:100%;height:640px;border:1px solid #e5e5ea;border-radius:18px;overflow:hidden';container.appendChild(panel)}
    else{var button=document.createElement('button');button.textContent='✦';button.title='Abrir asistente';button.setAttribute('aria-label','Abrir o cerrar asistente');button.style.cssText='position:fixed;bottom:24px;right:24px;width:58px;height:58px;border:0;border-radius:50%;background:#6b59df;color:white;font-size:27px;cursor:pointer;box-shadow:0 8px 28px #0003;z-index:2147483000';panel.style.cssText='position:fixed;bottom:94px;right:24px;width:min(390px,calc(100vw - 32px));height:min(640px,calc(100dvh - 120px));border-radius:20px;box-shadow:0 16px 60px #0003;overflow:hidden;z-index:2147483000;display:none';button.onclick=function(){panel.style.display=panel.style.display==='none'?'block':'none';button.textContent=panel.style.display==='none'?'✦':'×'};document.body.appendChild(button);document.body.appendChild(panel)}
    frame.onload=function(){frame.contentWindow.postMessage({type:'nexo:init'},host)};
    window.addEventListener('message',function(e){if(e.origin!==host||e.source!==frame.contentWindow||e.data?.assistantId!==id)return;if(e.data.type==='nexo:ready')frame.contentWindow.postMessage({type:'nexo:init'},host);if(e.data.type==='nexo:product-selected')window.dispatchEvent(new CustomEvent('nexo:product-selected',{detail:{assistantId:id,productId:e.data.productId}}))});
  })();`;
  return new Response(script, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
}
