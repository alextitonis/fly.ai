import{t as a,e as l,f as k,a as R,m as T}from"./index-D_z-o05-.js";const g=t=>t.startsWith("/api/fv/")?R(t):t,h=t=>`${Math.round(t)}%`,U=t=>`https://www.flyaiworld.com/flyverse/#story=${encodeURIComponent(t)}`,q=t=>Math.max(0,Math.ceil((t-Date.now())/864e5));async function _(t){try{const e=await k(t,{cache:"no-store"});return e.ok?await e.json():null}catch{return null}}async function $(t,e){const o=await k(t,{method:"POST",body:JSON.stringify(e)}),s=await o.json().catch(()=>({}));if(!o.ok)throw new Error(s.error??a("story.failed"));return s}async function X(t){var d;const e=await _("/api/fv/story"),o=(e==null?void 0:e.live)??((d=e==null?void 0:e.episodes.find(r=>r.state!=="draft"))==null?void 0:d.id),s=e==null?void 0:e.episodes.find(r=>r.id===o);if(!s){e!=null&&e.team&&(t.innerHTML=`<p class="fv-small"><a href="#story">${a("story.team_open")}</a></p>`);return}t.innerHTML=`<a class="fv-storycard" href="#story=${l(s.id)}" ${s.poster?`style="--poster:url('${l(g(s.poster))}')"`:""}>
    <span class="fv-eyebrow">${l(a("story.eyebrow",{n:s.n}))}${s.state==="live"&&s.closes?` · ${l(a("story.days_left",{d:q(s.closes)}))}`:""}</span>
    <b>${l(s.title)}</b>
    <span>${l(s.logline)}</span>
    <span class="fv-primary sm">${a("story.watch")}</span>
  </a>`}async function S(t,e,o){var f,v;t.innerHTML=`<section class="fv-home fv-story"><p class="fv-small">${a("story.loading")}</p></section>`;const s=await _("/api/fv/story"),d=e||(s==null?void 0:s.live)||((f=s==null?void 0:s.episodes.find(p=>p.state!=="draft"))==null?void 0:f.id)||"",r=d?await _(`/api/fv/story/ep/${encodeURIComponent(d)}`):null,i=t.querySelector(".fv-story");if(!r){i.innerHTML=`<p><a href="#" class="fv-small">${a("creator.back")}</a></p><header class="fv-head"><h1>${a("story.title")}</h1><p class="lede">${a("story.none")}</p></header>${s!=null&&s.team?C(null):""}`,s!=null&&s.team&&j(i,null,()=>S(t,"",o));return}const n=r.ep,m=n.state==="live"&&(!n.closes||n.closes>Date.now()),u=n.tally,w=((s==null?void 0:s.episodes)??[]).filter(p=>p.id!==n.id&&p.state!=="draft");i.innerHTML=`
    <p><a href="#" class="fv-small">${a("creator.back")}</a></p>
    <header class="fv-head">
      <p class="eyebrow">${l(a("story.eyebrow",{n:n.n}))}${n.state==="draft"?" · DRAFT":""}</p>
      <h1>${l(n.title)}</h1>
      <p class="lede">${l(n.logline)}</p>
    </header>
    ${(v=r.prev)!=null&&v.outcome?I(r.prev):""}
    <div class="fv-ep">
      <div class="fv-ep-video">
        ${n.video?`<video playsinline controls preload="metadata" ${n.poster?`poster="${l(g(n.poster))}"`:""} src="${l(g(n.video))}"></video>`:""}
        <div class="fv-ep-cliff" ${n.video?"hidden":""}>
          <p class="fv-eyebrow">${a("story.your_turn")}</p>
          <h2>${l(n.cliffhanger||a("story.play"))}</h2>
          ${n.game?`<button class="fv-primary" data-a="play">${a("story.play")}</button>`:""}
        </div>
      </div>
      <div class="fv-ep-side">
        ${n.game?`<button class="fv-primary fv-ep-playbtn" data-a="play">▶ ${l(n.cliffhanger||a("story.play"))}</button>`:""}
        ${n.game&&m?`<p class="fv-small fv-storynote">${l(a("story.reward_line",{amount:100}))}</p>`:""}
        <div class="fv-ep-tally">
          <p class="fv-eyebrow">${n.state==="closed"?a("story.final"):a("story.so_far")}</p>
          <div class="fv-ep-bar"><i style="width:${Math.min(100,u.rate)}%"></i></div>
          <p><b>${u.tried?h(u.rate):"–"}</b> ${l(a("story.made_it",{made:u.made,tried:u.tried}))}</p>
          <p class="fv-small">${a("story.tally_note")}</p>
        </div>
        <div class="fv-row">
          <button data-a="share">${a("share.share")}</button>
          ${n.post?`<a class="fv-btnlink" target="_blank" rel="noopener" href="https://x.com/flydotai/status/${l(n.post)}">${a("story.on_x")}</a>`:""}
        </div>
        ${m?`<p class="fv-small">${l(a("story.days_left",{d:q(n.closes)}))}</p>`:""}
      </div>
    </div>
    ${n.credits.length?`<p class="fv-small fv-ep-credits">${a("story.ideas_by")} ${n.credits.map(p=>l(p.name)).join(", ")}</p>`:""}

    <h2 class="fv-h2">${a("story.next_title")}</h2>
    <p class="fv-small">${a("story.next_how")}</p>
    ${m?H(r):`<p class="fv-small">${a("story.replies_closed")}</p>`}
    ${n.state==="closed"&&n.outcome?M(n.outcome):""}
    <ol class="fv-ep-replies">${r.replies.map(p=>D(p,!!(s!=null&&s.team))).join("")||`<li class="fv-small">${a("story.no_replies")}</li>`}</ol>
    <p class="fv-small">${l(a("story.count",{replies:r.count.replies,counted:r.count.counted}))}</p>

    ${w.length?`<h2 class="fv-h2">${a("story.episodes")}</h2><div class="fv-ep-list">${w.map(p=>{var b;return`<a href="#story=${l(p.id)}"><span class="fv-eyebrow">${l(a("story.eyebrow",{n:p.n}))}</span><b>${l(p.title)}</b>${(b=p.tally)!=null&&b.tried?`<span class="fv-small">${l(a("story.made_it_short",{rate:h(p.tally.rate)}))}</span>`:""}</a>`}).join("")}</div>`:""}
    ${s!=null&&s.team?C(r):""}
  `,window.scrollTo(0,0);const c=i.querySelector("video"),y=i.querySelector(".fv-ep-cliff");c&&(c.onended=()=>{y.hidden=!1}),i.querySelectorAll("[data-a=play]").forEach(p=>p.onclick=()=>o(`play=${encodeURIComponent(n.game)}&story=${encodeURIComponent(n.id)}`)),i.querySelector("[data-a=share]").onclick=()=>L(n),N(i,r),s!=null&&s.team&&j(i,r,()=>S(t,n.id,o))}function I(t){const e=t.outcome,o=e.tally.tried>0&&e.tally.rate>=50,s=e.ideas[0];return`<div class="fv-ep-prev">
    <p class="fv-eyebrow">${l(a("story.last_week",{n:t.n}))}</p>
    <p><b>${e.tally.tried?l(a(o?"story.prev_made":"story.prev_failed",{rate:h(e.tally.rate),tried:e.tally.tried})):l(a("story.prev_none"))}</b></p>
    ${(o?t.win:t.lose)?`<p>${l(o?t.win:t.lose)}</p>`:""}
    ${s?`<p class="fv-small">${l(a("story.prev_idea",{idea:s.idea,share:h(s.share)}))}</p>`:""}
  </div>`}function M(t){return t.ideas.length?`<div class="fv-ep-ideas"><p class="fv-eyebrow">${a("story.ideas_title")}</p>
    ${t.ideas.map(e=>`<div><div class="fv-ep-bar"><i style="width:${Math.min(100,e.share)}%"></i></div><p><b>${h(e.share)}</b> ${l(e.idea)}</p>${e.quotes.map(o=>`<p class="fv-small">“${l(o)}”</p>`).join("")}</div>`).join("")}
  </div>`:""}function D(t,e){const o=t.source==="x"?`@${l(t.handle)}`:l(t.wallet||a("story.someone")),s=t.weight>0?`<span class="fv-ep-w">×${t.weight}</span>`:`<span class="fv-ep-w off">${a("story.not_counted")}</span>`;return`<li class="${t.hidden?"hidden-reply":""}"><p>${l(t.text)}</p><p class="fv-small">${o}${t.source==="x"?" · X":""} ${s}
    ${e?` <button class="sm ghost" data-hide="${t.id}" data-on="${t.hidden?"0":"1"}">${t.hidden?"unhide":"hide"}</button>${t.full?` <span class="fv-small">${l(t.full)}</span>`:""}`:""}</p></li>`}function H(t){var o;if(T.anon)return`<p class="fv-keys fv-signin">${a("story.sign_in")}</p>`;const e=t.myWeight??0;return`<form class="fv-ep-reply">
    <textarea maxlength="280" rows="3" placeholder="${l(a("story.reply_ph"))}">${l(((o=t.mine)==null?void 0:o.text)??"")}</textarea>
    <div class="fv-row"><button class="fv-primary" type="submit">${t.mine?a("story.reply_update"):a("story.reply_send")}</button>
    <span class="fv-small">${e>0?l(a("story.your_weight",{w:e})):a("story.hold_to_count")}</span></div>
    <p class="fv-status" data-s></p>
  </form>`}function N(t,e){const o=t.querySelector(".fv-ep-reply");if(!o)return;const s=o.querySelector("[data-s]");o.onsubmit=async d=>{d.preventDefault();const r=o.querySelector("textarea").value.trim();s.className="fv-status busy",s.textContent=a("story.sending");try{const i=await $("/api/fv/story/reply",{ep:e.ep.id,text:r});s.className="fv-status ok",s.textContent=i.mine.weight>0?a("story.sent_counted",{w:i.mine.weight}):a("story.sent_not_counted")}catch(i){s.className="fv-status err",s.textContent=i instanceof Error?i.message:a("story.failed")}}}function L(t){const e=a("story.share_text",{title:t.title,cliff:t.cliffhanger||a("story.play")}),o=U(t.id);if(navigator.share){navigator.share({title:t.title,text:e,url:o}).catch(()=>{});return}window.open(`https://x.com/intent/post?text=${encodeURIComponent(e)}&url=${encodeURIComponent(o)}`,"_blank","noopener")}const x=t=>t?new Date(t-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,16):"";function C(t){var s;const e=t==null?void 0:t.ep,o=(d,r,i,n=!1)=>`<label>${r}${n?`<textarea name="${d}" rows="2">${l(i)}</textarea>`:`<input name="${d}" value="${l(i)}">`}</label>`;return`<details class="fv-ep-team" ${e?"":"open"}><summary>Team: ${e?`episode ${l(e.id)}`:"first episode"}</summary>
    <form class="fv-ep-form">
      <div class="fv-ep-grid">
        ${o("id","Id (e.g. ep1)",(e==null?void 0:e.id)??"ep1")}${o("n","Number",String((e==null?void 0:e.n)??1))}
        ${o("title","Title",(e==null?void 0:e.title)??"")}${o("game","Scene game id (publish it in Flyverse first)",(e==null?void 0:e.game)??"")}
        ${o("logline","Logline",(e==null?void 0:e.logline)??"",!0)}${o("cliffhanger","Cliffhanger (the button: Get him out!)",(e==null?void 0:e.cliffhanger)??"")}
        ${o("win","If most made it (shown next week)",(e==null?void 0:e.win)??"",!0)}${o("lose","If most didn't",(e==null?void 0:e.lose)??"",!0)}
        ${o("video","Video URL (or upload below)",(e==null?void 0:e.video)??"")}${o("poster","Poster URL (or upload below)",(e==null?void 0:e.poster)??"")}
        ${o("post","X post link (replies are read from it)",e!=null&&e.post?`https://x.com/flydotai/status/${e.post}`:"")}
        <label>State<select name="state">${["draft","live",...(e==null?void 0:e.state)==="closed"?["closed"]:[]].map(d=>`<option ${(e==null?void 0:e.state)===d?"selected":""}>${d}</option>`).join("")}</select></label>
        <label>Opens<input type="datetime-local" name="opens" value="${x((e==null?void 0:e.opens)??0)}"></label>
        <label>Closes<input type="datetime-local" name="closes" value="${x((e==null?void 0:e.closes)??0)}"></label>
      </div>
      <div class="fv-row"><button class="fv-primary" type="submit">Save</button>
        ${e?`<label class="fv-btnlink">Upload video/poster<input type="file" accept="video/mp4,video/webm,image/jpeg,image/webp" data-a="upload" hidden></label>
        <button type="button" data-a="readx" ${e.post?"":"disabled"}>Read X replies now</button>
        ${e.state==="live"?'<button type="button" class="danger" data-a="close">Close the week</button>':""}`:""}
        <a class="fv-btnlink" href="#story=new">New episode</a></div>
      <p class="fv-status" data-s></p>
    </form>
    ${(e==null?void 0:e.state)==="closed"&&((s=e.outcome)!=null&&s.ideas.length)?`<div class="fv-ep-credit"><p class="fv-eyebrow">Credit the ideas you used (100 XP each, shown on this episode)</p>
      ${e.outcome.ideas.map((d,r)=>`<p><b>${h(d.share)}</b> ${l(d.idea)}<br>${d.wallets.map(i=>`<label class="fv-small"><input type="checkbox" value="${l(i)}" data-k="${r}"> ${l(i.slice(0,6))}…${l(i.slice(-4))}</label>`).join(" ")}</p>`).join("")}
      <button data-a="credit">Credit the ticked wallets</button></div>`:""}
  </details>`}function j(t,e,o){const s=t.querySelector(".fv-ep-form");if(!s)return;const d=s.querySelector("[data-s]"),r=(c,y="busy")=>{d.className="fv-status "+y,d.textContent=c},i=c=>async()=>{try{await c()}catch(y){r(y instanceof Error?y.message:"failed","err")}};location.hash.includes("story=new")&&s.reset(),s.onsubmit=c=>{c.preventDefault(),i(async()=>{const y=new FormData(s),f={};y.forEach((p,b)=>{f[b]=String(p)}),f.opens=f.opens?Date.parse(String(f.opens)):0,f.closes=f.closes?Date.parse(String(f.closes)):0,f.n=Number(f.n),r("Saving…");const v=await $("/api/fv/story/save",f);r(v.warn??"Saved",v.warn?"err":"ok"),v.warn||(location.hash=`story=${v.ep.id}`,o())})()};const n=s.querySelector("[data-a=upload]");n&&e&&(n.onchange=i(async()=>{var v;const c=(v=n.files)==null?void 0:v[0];if(!c)return;r(`Uploading ${(c.size/1e6).toFixed(1)} MB…`);const y=await k(`/api/fv/story/video?ep=${encodeURIComponent(e.ep.id)}`,{method:"POST",body:c,headers:{"content-type":c.type}}),f=await y.json().catch(()=>({}));if(!y.ok)throw new Error(f.error??"upload failed");r("Uploaded","ok"),o()}));const m=s.querySelector("[data-a=readx]");m&&e&&(m.onclick=i(async()=>{r("Reading X replies (up to a few minutes)…");const c=await $("/api/fv/story/x",{ep:e.ep.id});r(`Read ${c.read} replies`,"ok"),o()}));const u=s.querySelector("[data-a=close]");u&&e&&(u.onclick=i(async()=>{confirm("Close the week? The tally freezes, X replies are read and grouped into ideas. Replies close.")&&(r("Closing: reading X and grouping the replies…"),await $("/api/fv/story/close",{ep:e.ep.id}),o())}));const w=t.querySelector("[data-a=credit]");w&&e&&(w.onclick=i(async()=>{const c=[...t.querySelectorAll(".fv-ep-credit input:checked")].map(y=>y.value);await $("/api/fv/story/credit",{ep:e.ep.id,wallets:c}),o()})),t.querySelectorAll("[data-hide]").forEach(c=>c.onclick=i(async()=>{await $("/api/fv/story/hide",{id:Number(c.dataset.hide),on:c.dataset.on==="1"}),o()}))}export{X as storyCard,S as storyPage};
