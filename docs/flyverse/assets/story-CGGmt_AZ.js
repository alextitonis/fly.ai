import{t as a,e as n,f as k,a as R,m as T}from"./index--ucl8hYL.js";function U(t){var o,s;if(!t)return"";const e=`<span class="fv-small"> · ${n(a("story.reward_given",{given:t.given,cap:t.cap}))}</span>`;return((o=t.mine)==null?void 0:o.status)==="paid"?`<p class="fv-keys fv-storynote">${n(a("story.reward_paid",{amount:t.amount}))}${t.mine.tx?` · <a target="_blank" rel="noopener" href="https://robinhoodchain.blockscout.com/tx/${n(t.mine.tx)}">${a("story.view_tx")}</a>`:""}</p>`:((s=t.mine)==null?void 0:s.status)==="owed"?`<p class="fv-keys fv-storynote">${n(a("story.reward_owed",{amount:t.amount}))}</p>`:t.open?`<p class="fv-keys fv-storynote">${n(a("story.reward_line",{amount:t.amount}))}${e}</p>`:""}const g=t=>t.startsWith("/api/fv/")?R(t):t,$=t=>`${Math.round(t)}%`,I=t=>`https://www.flyaiworld.com/flyverse/#story=${encodeURIComponent(t)}`,q=t=>Math.max(0,Math.ceil((t-Date.now())/864e5));async function _(t){try{const e=await k(t,{cache:"no-store"});return e.ok?await e.json():null}catch{return null}}async function m(t,e){const o=await k(t,{method:"POST",body:JSON.stringify(e)}),s=await o.json().catch(()=>({}));if(!o.ok)throw new Error(s.error??a("story.failed"));return s}async function O(t){var p;const e=await _("/api/fv/story"),o=(e==null?void 0:e.live)??((p=e==null?void 0:e.episodes.find(r=>r.state!=="draft"))==null?void 0:p.id),s=e==null?void 0:e.episodes.find(r=>r.id===o);if(!s){e!=null&&e.team&&(t.innerHTML=`<p class="fv-small"><a href="#story">${a("story.team_open")}</a></p>`);return}t.innerHTML=`<a class="fv-storycard" href="#story=${n(s.id)}" ${s.poster?`style="--poster:url('${n(g(s.poster))}')"`:""}>
    <span class="fv-eyebrow">${n(a("story.eyebrow",{n:s.n}))}${s.state==="live"&&s.closes?` · ${n(a("story.days_left",{d:q(s.closes)}))}`:""}</span>
    <b>${n(s.title)}</b>
    <span>${n(s.logline)}</span>
    <span class="fv-primary sm">${a("story.watch")}</span>
  </a>`}async function x(t,e,o){var f,u;t.innerHTML=`<section class="fv-home fv-story"><p class="fv-small">${a("story.loading")}</p></section>`;const s=await _("/api/fv/story"),p=e||(s==null?void 0:s.live)||((f=s==null?void 0:s.episodes.find(d=>d.state!=="draft"))==null?void 0:f.id)||"",r=p?await _(`/api/fv/story/ep/${encodeURIComponent(p)}`):null,i=t.querySelector(".fv-story");if(!r){i.innerHTML=`<p><a href="#" class="fv-small">${a("creator.back")}</a></p><header class="fv-head"><h1>${a("story.title")}</h1><p class="lede">${a("story.none")}</p></header>${s!=null&&s.team?C(null):""}`,s!=null&&s.team&&j(i,null,()=>x(t,"",o));return}const l=r.ep,h=l.state==="live"&&(!l.closes||l.closes>Date.now()),v=l.tally,w=((s==null?void 0:s.episodes)??[]).filter(d=>d.id!==l.id&&d.state!=="draft");i.innerHTML=`
    <p><a href="#" class="fv-small">${a("creator.back")}</a></p>
    <header class="fv-head">
      <p class="eyebrow">${n(a("story.eyebrow",{n:l.n}))}${l.state==="draft"?" · DRAFT":""}</p>
      <h1>${n(l.title)}</h1>
      <p class="lede">${n(l.logline)}</p>
    </header>
    ${(u=r.prev)!=null&&u.outcome?H(r.prev):""}
    <div class="fv-ep">
      <div class="fv-ep-video">
        ${l.video?`<video playsinline controls preload="metadata" ${l.poster?`poster="${n(g(l.poster))}"`:""} src="${n(g(l.video))}"></video>`:""}
        <div class="fv-ep-cliff" ${l.video?"hidden":""}>
          <p class="fv-eyebrow">${a("story.your_turn")}</p>
          <h2>${n(l.cliffhanger||a("story.play"))}</h2>
          ${l.game?`<button class="fv-primary" data-a="play">${a("story.play")}</button>`:""}
        </div>
      </div>
      <div class="fv-ep-side">
        ${l.game?`<button class="fv-primary fv-ep-playbtn" data-a="play">▶ ${n(l.cliffhanger||a("story.play"))}</button>`:""}
        ${l.game?U(r.reward):""}
        <div class="fv-ep-tally">
          <p class="fv-eyebrow">${l.state==="closed"?a("story.final"):a("story.so_far")}</p>
          <div class="fv-ep-bar"><i style="width:${Math.min(100,v.rate)}%"></i></div>
          <p><b>${v.tried?$(v.rate):"–"}</b> ${n(a("story.made_it",{made:v.made,tried:v.tried}))}</p>
          <p class="fv-small">${a("story.tally_note")}</p>
        </div>
        <div class="fv-row">
          <button data-a="share">${a("share.share")}</button>
          ${l.post?`<a class="fv-btnlink" target="_blank" rel="noopener" href="https://x.com/flydotai/status/${n(l.post)}">${a("story.on_x")}</a>`:""}
        </div>
        ${h?`<p class="fv-small">${n(a("story.days_left",{d:q(l.closes)}))}</p>`:""}
      </div>
    </div>
    ${l.credits.length?`<p class="fv-small fv-ep-credits">${a("story.ideas_by")} ${l.credits.map(d=>n(d.name)).join(", ")}</p>`:""}

    <h2 class="fv-h2">${a("story.next_title")}</h2>
    <p class="fv-small">${a("story.next_how")}</p>
    ${h?N(r):`<p class="fv-small">${a("story.replies_closed")}</p>`}
    ${l.state==="closed"&&l.outcome?M(l.outcome):""}
    <ol class="fv-ep-replies">${r.replies.map(d=>D(d,!!(s!=null&&s.team))).join("")||`<li class="fv-small">${a("story.no_replies")}</li>`}</ol>
    <p class="fv-small">${n(a("story.count",{replies:r.count.replies,counted:r.count.counted}))}</p>

    ${w.length?`<h2 class="fv-h2">${a("story.episodes")}</h2><div class="fv-ep-list">${w.map(d=>{var b;return`<a href="#story=${n(d.id)}"><span class="fv-eyebrow">${n(a("story.eyebrow",{n:d.n}))}</span><b>${n(d.title)}</b>${(b=d.tally)!=null&&b.tried?`<span class="fv-small">${n(a("story.made_it_short",{rate:$(d.tally.rate)}))}</span>`:""}</a>`}).join("")}</div>`:""}
    ${s!=null&&s.team?C(r):""}
  `,window.scrollTo(0,0);const c=i.querySelector("video"),y=i.querySelector(".fv-ep-cliff");c&&(c.onended=()=>{y.hidden=!1}),i.querySelectorAll("[data-a=play]").forEach(d=>d.onclick=()=>o(`play=${encodeURIComponent(l.game)}&story=${encodeURIComponent(l.id)}`)),i.querySelector("[data-a=share]").onclick=()=>E(l),L(i,r),s!=null&&s.team&&j(i,r,()=>x(t,l.id,o))}function H(t){const e=t.outcome,o=e.tally.tried>0&&e.tally.rate>=50,s=e.ideas[0];return`<div class="fv-ep-prev">
    <p class="fv-eyebrow">${n(a("story.last_week",{n:t.n}))}</p>
    <p><b>${e.tally.tried?n(a(o?"story.prev_made":"story.prev_failed",{rate:$(e.tally.rate),tried:e.tally.tried})):n(a("story.prev_none"))}</b></p>
    ${(o?t.win:t.lose)?`<p>${n(o?t.win:t.lose)}</p>`:""}
    ${s?`<p class="fv-small">${n(a("story.prev_idea",{idea:s.idea,share:$(s.share)}))}</p>`:""}
  </div>`}function M(t){return t.ideas.length?`<div class="fv-ep-ideas"><p class="fv-eyebrow">${a("story.ideas_title")}</p>
    ${t.ideas.map(e=>`<div><div class="fv-ep-bar"><i style="width:${Math.min(100,e.share)}%"></i></div><p><b>${$(e.share)}</b> ${n(e.idea)}</p>${e.quotes.map(o=>`<p class="fv-small">“${n(o)}”</p>`).join("")}</div>`).join("")}
  </div>`:""}function D(t,e){const o=t.source==="x"?`@${n(t.handle)}`:n(t.wallet||a("story.someone")),s=t.weight>0?`<span class="fv-ep-w">×${t.weight}</span>`:`<span class="fv-ep-w off">${a("story.not_counted")}</span>`;return`<li class="${t.hidden?"hidden-reply":""}"><p>${n(t.text)}</p><p class="fv-small">${o}${t.source==="x"?" · X":""} ${s}
    ${e?` <button class="sm ghost" data-hide="${t.id}" data-on="${t.hidden?"0":"1"}">${t.hidden?"unhide":"hide"}</button>${t.full?` <span class="fv-small">${n(t.full)}</span>`:""}`:""}</p></li>`}function N(t){var o;if(T.anon)return`<p class="fv-keys fv-signin">${a("story.sign_in")}</p>`;const e=t.myWeight??0;return`<form class="fv-ep-reply">
    <textarea maxlength="280" rows="3" placeholder="${n(a("story.reply_ph"))}">${n(((o=t.mine)==null?void 0:o.text)??"")}</textarea>
    <div class="fv-row"><button class="fv-primary" type="submit">${t.mine?a("story.reply_update"):a("story.reply_send")}</button>
    <span class="fv-small">${e>0?n(a("story.your_weight",{w:e})):a("story.hold_to_count")}</span></div>
    <p class="fv-status" data-s></p>
  </form>`}function L(t,e){const o=t.querySelector(".fv-ep-reply");if(!o)return;const s=o.querySelector("[data-s]");o.onsubmit=async p=>{p.preventDefault();const r=o.querySelector("textarea").value.trim();s.className="fv-status busy",s.textContent=a("story.sending");try{const i=await m("/api/fv/story/reply",{ep:e.ep.id,text:r});s.className="fv-status ok",s.textContent=i.mine.weight>0?a("story.sent_counted",{w:i.mine.weight}):a("story.sent_not_counted")}catch(i){s.className="fv-status err",s.textContent=i instanceof Error?i.message:a("story.failed")}}}function E(t){const e=a("story.share_text",{title:t.title,cliff:t.cliffhanger||a("story.play")}),o=I(t.id);if(navigator.share){navigator.share({title:t.title,text:e,url:o}).catch(()=>{});return}window.open(`https://x.com/intent/post?text=${encodeURIComponent(e)}&url=${encodeURIComponent(o)}`,"_blank","noopener")}const S=t=>t?new Date(t-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,16):"";function C(t){var s;const e=t==null?void 0:t.ep,o=(p,r,i,l=!1)=>`<label>${r}${l?`<textarea name="${p}" rows="2">${n(i)}</textarea>`:`<input name="${p}" value="${n(i)}">`}</label>`;return`<details class="fv-ep-team" ${e?"":"open"}><summary>Team: ${e?`episode ${n(e.id)}`:"first episode"}</summary>
    <form class="fv-ep-form">
      <div class="fv-ep-grid">
        ${o("id","Id (e.g. ep1)",(e==null?void 0:e.id)??"ep1")}${o("n","Number",String((e==null?void 0:e.n)??1))}
        ${o("title","Title",(e==null?void 0:e.title)??"")}${o("game","Scene game id (publish it in Flyverse first)",(e==null?void 0:e.game)??"")}
        ${o("logline","Logline",(e==null?void 0:e.logline)??"",!0)}${o("cliffhanger","Cliffhanger (the button: Get him out!)",(e==null?void 0:e.cliffhanger)??"")}
        ${o("win","If most made it (shown next week)",(e==null?void 0:e.win)??"",!0)}${o("lose","If most didn't",(e==null?void 0:e.lose)??"",!0)}
        ${o("video","Video URL (or upload below)",(e==null?void 0:e.video)??"")}${o("poster","Poster URL (or upload below)",(e==null?void 0:e.poster)??"")}
        ${o("post","X post link (replies are read from it)",e!=null&&e.post?`https://x.com/flydotai/status/${e.post}`:"")}
        <label>State<select name="state">${["draft","live",...(e==null?void 0:e.state)==="closed"?["closed"]:[]].map(p=>`<option ${(e==null?void 0:e.state)===p?"selected":""}>${p}</option>`).join("")}</select></label>
        <label>Opens<input type="datetime-local" name="opens" value="${S((e==null?void 0:e.opens)??0)}"></label>
        <label>Closes<input type="datetime-local" name="closes" value="${S((e==null?void 0:e.closes)??0)}"></label>
      </div>
      <div class="fv-row"><button class="fv-primary" type="submit">Save</button>
        ${e?`<label class="fv-btnlink">Upload video/poster<input type="file" accept="video/mp4,video/webm,image/jpeg,image/webp" data-a="upload" hidden></label>
        <button type="button" data-a="readx" ${e.post?"":"disabled"}>Read X replies now</button>
        ${e.state==="live"?'<button type="button" class="danger" data-a="close">Close the week</button>':""}`:""}
        <a class="fv-btnlink" href="#story=new">New episode</a></div>
      <p class="fv-status" data-s></p>
    </form>
    ${(e==null?void 0:e.state)==="closed"&&((s=e.outcome)!=null&&s.ideas.length)?`<div class="fv-ep-credit"><p class="fv-eyebrow">Credit the ideas you used (100 XP each, shown on this episode)</p>
      ${e.outcome.ideas.map((p,r)=>`<p><b>${$(p.share)}</b> ${n(p.idea)}<br>${p.wallets.map(i=>`<label class="fv-small"><input type="checkbox" value="${n(i)}" data-k="${r}"> ${n(i.slice(0,6))}…${n(i.slice(-4))}</label>`).join(" ")}</p>`).join("")}
      <button data-a="credit">Credit the ticked wallets</button></div>`:""}
  </details>`}function j(t,e,o){const s=t.querySelector(".fv-ep-form");if(!s)return;const p=s.querySelector("[data-s]"),r=(c,y="busy")=>{p.className="fv-status "+y,p.textContent=c},i=c=>async()=>{try{await c()}catch(y){r(y instanceof Error?y.message:"failed","err")}};location.hash.includes("story=new")&&s.reset(),s.onsubmit=c=>{c.preventDefault(),i(async()=>{const y=new FormData(s),f={};y.forEach((d,b)=>{f[b]=String(d)}),f.opens=f.opens?Date.parse(String(f.opens)):0,f.closes=f.closes?Date.parse(String(f.closes)):0,f.n=Number(f.n),r("Saving…");const u=await m("/api/fv/story/save",f);r(u.warn??"Saved",u.warn?"err":"ok"),u.warn||(location.hash=`story=${u.ep.id}`,o())})()};const l=s.querySelector("[data-a=upload]");l&&e&&(l.onchange=i(async()=>{var u;const c=(u=l.files)==null?void 0:u[0];if(!c)return;r(`Uploading ${(c.size/1e6).toFixed(1)} MB…`);const y=await k(`/api/fv/story/video?ep=${encodeURIComponent(e.ep.id)}`,{method:"POST",body:c,headers:{"content-type":c.type}}),f=await y.json().catch(()=>({}));if(!y.ok)throw new Error(f.error??"upload failed");r("Uploaded","ok"),o()}));const h=s.querySelector("[data-a=readx]");h&&e&&(h.onclick=i(async()=>{r("Reading X replies (up to a few minutes)…");const c=await m("/api/fv/story/x",{ep:e.ep.id});r(`Read ${c.read} replies`,"ok"),o()}));const v=s.querySelector("[data-a=close]");v&&e&&(v.onclick=i(async()=>{confirm("Close the week? The tally freezes, X replies are read and grouped into ideas. Replies close.")&&(r("Closing: reading X and grouping the replies…"),await m("/api/fv/story/close",{ep:e.ep.id}),o())}));const w=t.querySelector("[data-a=credit]");w&&e&&(w.onclick=i(async()=>{const c=[...t.querySelectorAll(".fv-ep-credit input:checked")].map(y=>y.value);await m("/api/fv/story/credit",{ep:e.ep.id,wallets:c}),o()})),t.querySelectorAll("[data-hide]").forEach(c=>c.onclick=i(async()=>{await m("/api/fv/story/hide",{id:Number(c.dataset.hide),on:c.dataset.on==="1"}),o()}))}export{U as rewardHtml,O as storyCard,x as storyPage};
