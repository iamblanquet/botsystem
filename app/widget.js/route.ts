import { launcherPresentation } from '@/lib/launcher';
import { requestOrigin } from '@/lib/request-origin';

export async function GET(request: Request) {
  const origin = requestOrigin(request);
  const script = `(function(launcherDesign){
    var s=document.currentScript,id=s&&s.dataset.assistantId;if(!id)return;
    var host=${JSON.stringify(origin)},inline=s.dataset.container,frame=document.createElement('iframe'),button,panel=document.createElement('div'),design=launcherDesign({}),isOpen=false,name='Asistente de atención';
    frame.src=host+'/embed/'+encodeURIComponent(id);frame.title=name;frame.setAttribute('allow','');frame.style.cssText='border:0;width:100%;height:100%;display:block;border-radius:inherit;background:#fff';panel.appendChild(frame);
    function styles(element,values){Object.keys(values).forEach(function(key){element.style[key]=values[key]})}
    function renderButton(){
      if(!button)return;button.textContent='';button.setAttribute('aria-label',(isOpen?'Cerrar chat de ':'Abrir chat de ')+name);button.setAttribute('aria-expanded',String(isOpen));button.title=(isOpen?'Cerrar chat de ':'Abrir chat de ')+name;
      var paths={sparkles:'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',book:'M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v15',wine:'M8 3h8l2 6c1 4-2 6-6 6s-7-2-6-6l2-6Zm4 12v6m-4 0h8',message:'M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-1l-5 2 2-5a10 10 0 0 1-1-4 9 9 0 1 1 17-1Z',close:'M6 6l12 12M6 18 18 6'};
      function icon(){button.textContent='';var svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.style.cssText='width:42%;height:42%;pointer-events:none';path.setAttribute('d',paths[isOpen?'close':design.icon]);svg.appendChild(path);button.appendChild(svg)}
      if(!isOpen&&design.logo){var image=document.createElement('img');image.alt='';image.referrerPolicy='no-referrer';image.style.cssText='width:68%;height:68%;object-fit:contain;pointer-events:none';image.onerror=function(){if(!isOpen)icon()};image.src=design.logo;button.appendChild(image)}else icon();
    }
    if(inline){var container=document.querySelector(inline);if(!container)return;panel.style.cssText='width:100%;height:640px;border:1px solid #e5e5ea;border-radius:18px;overflow:hidden';container.appendChild(panel)}
    else{
      button=document.createElement('button');button.type='button';button.setAttribute('data-nexo-launcher',id);button.style.cssText='position:fixed;padding:0;border:0;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:#6b59df;color:#fff;cursor:pointer;box-shadow:0 8px 28px #0003;z-index:2147483001;box-sizing:border-box';
      panel.setAttribute('data-nexo-panel',id);panel.style.cssText='position:fixed;border-radius:20px;box-shadow:0 16px 60px #0003;overflow:hidden;z-index:2147483000;display:none';styles(button,design.buttonStyle);styles(panel,design.panelStyle);renderButton();
      button.onclick=function(){isOpen=!isOpen;panel.style.display=isOpen?'block':'none';renderButton()};button.onkeydown=function(event){if(event.key==='Escape'&&isOpen){isOpen=false;panel.style.display='none';renderButton()}};
      document.body.appendChild(button);document.body.appendChild(panel);
    }
    function appearance(a){
      if(!a||!a.theme)return;var t=a.theme,hex=function(v){return typeof v==='string'&&/^#[a-f0-9]{6}$/i.test(v)},bound=function(v,min,max,fallback){return Number.isInteger(v)&&v>=min&&v<=max?v:fallback};
      panel.style.borderRadius=bound(t.radius,0,28,12)+'px';if(hex(t.background)){panel.style.background=t.background;frame.style.background=t.background}if(hex(t.border))panel.style.borderColor=t.border;
      if(typeof a.name==='string'){name=a.name;frame.title=name}
      if(button){design=launcherDesign(t,a.color,host);styles(button,design.buttonStyle);styles(panel,design.panelStyle);button.style.background=design.background;button.style.color=design.foreground;renderButton()}
      else panel.style.height=bound(t.height,420,800,640)+'px';
    }
    frame.onload=function(){frame.contentWindow.postMessage({type:'nexo:init'},host)};
    window.addEventListener('message',function(e){if(e.origin!==host||e.source!==frame.contentWindow||e.data?.assistantId!==id)return;if(e.data.type==='nexo:ready')frame.contentWindow.postMessage({type:'nexo:init'},host);if(e.data.type==='nexo:connected')appearance(e.data.appearance);if(e.data.type==='nexo:product-selected')window.dispatchEvent(new CustomEvent('nexo:product-selected',{detail:{assistantId:id,productId:e.data.productId}}))});
  })(${launcherPresentation.toString()});`;
  return new Response(script, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
}
