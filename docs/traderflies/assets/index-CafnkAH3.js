import{cG as C,cH as O,cI as P,cJ as h,cK as b,cL as v,cM as l,cR as E,di as d,cQ as x,dK as g,cU as R,d7 as $,d1 as S,cV as T}from"./index-BuTG_r_z.js";const L=C`
  :host {
    position: relative;
    display: inline-block;
  }

  input {
    width: 48px;
    height: 48px;
    background: ${({tokens:n})=>n.theme.foregroundPrimary};
    border-radius: ${({borderRadius:n})=>n[4]};
    border: 1px solid ${({tokens:n})=>n.theme.borderPrimary};
    font-family: ${({fontFamily:n})=>n.regular};
    font-size: ${({textSize:n})=>n.large};
    line-height: 18px;
    letter-spacing: -0.16px;
    text-align: center;
    color: ${({tokens:n})=>n.theme.textPrimary};
    caret-color: ${({tokens:n})=>n.core.textAccentPrimary};
    transition:
      background-color ${({durations:n})=>n.lg}
        ${({easings:n})=>n["ease-out-power-2"]},
      border-color ${({durations:n})=>n.lg}
        ${({easings:n})=>n["ease-out-power-2"]},
      box-shadow ${({durations:n})=>n.lg}
        ${({easings:n})=>n["ease-out-power-2"]};
    will-change: background-color, border-color, box-shadow;
    box-sizing: border-box;
    -webkit-appearance: none;
    -moz-appearance: textfield;
    padding: ${({spacing:n})=>n[4]};
  }

  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  input[type='number'] {
    -moz-appearance: textfield;
  }

  input:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  input:focus-visible:enabled {
    background-color: transparent;
    border: 1px solid ${({tokens:n})=>n.theme.borderSecondary};
    box-shadow: 0px 0px 0px 4px ${({tokens:n})=>n.core.foregroundAccent040};
  }
`;var y=function(n,t,e,i){var s=arguments.length,o=s<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,e):i,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")o=Reflect.decorate(n,t,e,i);else for(var a=n.length-1;a>=0;a--)(r=n[a])&&(o=(s<3?r(o):s>3?r(t,e,o):r(t,e))||o);return s>3&&o&&Object.defineProperty(t,e,o),o};let p=class extends v{constructor(){super(...arguments),this.disabled=!1,this.value=""}render(){return l`<input
      type="number"
      maxlength="1"
      inputmode="numeric"
      autofocus
      ?disabled=${this.disabled}
      value=${this.value}
    /> `}};p.styles=[O,P,L];y([h({type:Boolean})],p.prototype,"disabled",void 0);y([h({type:String})],p.prototype,"value",void 0);p=y([b("wui-input-numeric")],p);const _=E`
  :host {
    position: relative;
    display: block;
  }
`;var m=function(n,t,e,i){var s=arguments.length,o=s<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,e):i,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")o=Reflect.decorate(n,t,e,i);else for(var a=n.length-1;a>=0;a--)(r=n[a])&&(o=(s<3?r(o):s>3?r(t,e,o):r(t,e))||o);return s>3&&o&&Object.defineProperty(t,e,o),o};let c=class extends v{constructor(){super(...arguments),this.length=6,this.otp="",this.values=Array.from({length:this.length}).map(()=>""),this.numerics=[],this.shouldInputBeEnabled=t=>this.values.slice(0,t).every(i=>i!==""),this.handleKeyDown=(t,e)=>{const i=t.target,s=this.getInputElement(i),o=["ArrowLeft","ArrowRight","Shift","Delete"];if(!s)return;o.includes(t.key)&&t.preventDefault();const r=s.selectionStart;switch(t.key){case"ArrowLeft":r&&s.setSelectionRange(r+1,r+1),this.focusInputField("prev",e);break;case"ArrowRight":this.focusInputField("next",e);break;case"Shift":this.focusInputField("next",e);break;case"Delete":s.value===""?this.focusInputField("prev",e):this.updateInput(s,e,"");break;case"Backspace":s.value===""?this.focusInputField("prev",e):this.updateInput(s,e,"");break}},this.focusInputField=(t,e)=>{if(t==="next"){const i=e+1;if(!this.shouldInputBeEnabled(i))return;const s=this.numerics[i<this.length?i:e],o=s?this.getInputElement(s):void 0;o&&(o.disabled=!1,o.focus())}if(t==="prev"){const i=e-1,s=this.numerics[i>-1?i:e],o=s?this.getInputElement(s):void 0;o&&o.focus()}}}firstUpdated(){var e,i;this.otp&&(this.values=this.otp.split(""));const t=(e=this.shadowRoot)==null?void 0:e.querySelectorAll("wui-input-numeric");t&&(this.numerics=Array.from(t)),(i=this.numerics[0])==null||i.focus()}render(){return l`
      <wui-flex gap="1" data-testid="wui-otp-input">
        ${Array.from({length:this.length}).map((t,e)=>l`
            <wui-input-numeric
              @input=${i=>this.handleInput(i,e)}
              @click=${i=>this.selectInput(i)}
              @keydown=${i=>this.handleKeyDown(i,e)}
              .disabled=${!this.shouldInputBeEnabled(e)}
              .value=${this.values[e]||""}
            >
            </wui-input-numeric>
          `)}
      </wui-flex>
    `}updateInput(t,e,i){const s=this.numerics[e],o=t||(s?this.getInputElement(s):void 0);o&&(o.value=i,this.values=this.values.map((r,a)=>a===e?i:r))}selectInput(t){const e=t.target;if(e){const i=this.getInputElement(e);i==null||i.select()}}handleInput(t,e){const i=t.target,s=this.getInputElement(i);if(s){const o=s.value;t.inputType==="insertFromPaste"?this.handlePaste(s,o,e):x.isNumber(o)&&t.data?(this.updateInput(s,e,t.data),this.focusInputField("next",e)):this.updateInput(s,e,"")}this.dispatchInputChangeEvent()}handlePaste(t,e,i){const s=e[0];if(s&&x.isNumber(s)){this.updateInput(t,i,s);const r=e.substring(1);if(i+1<this.length&&r.length){const a=this.numerics[i+1],I=a?this.getInputElement(a):void 0;I&&this.handlePaste(I,r,i+1)}else this.focusInputField("next",i)}else this.updateInput(t,i,"")}getInputElement(t){var e;return(e=t.shadowRoot)!=null&&e.querySelector("input")?t.shadowRoot.querySelector("input"):null}dispatchInputChangeEvent(){const t=this.values.join("");this.dispatchEvent(new CustomEvent("inputChange",{detail:t,bubbles:!0,composed:!0}))}};c.styles=[O,_];m([h({type:Number})],c.prototype,"length",void 0);m([h({type:String})],c.prototype,"otp",void 0);m([d()],c.prototype,"values",void 0);c=m([b("wui-otp")],c);const k=E`
  wui-loading-spinner {
    margin: 9px auto;
  }

  .email-display,
  .email-display wui-text {
    max-width: 100%;
  }
`;var f=function(n,t,e,i){var s=arguments.length,o=s<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,e):i,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")o=Reflect.decorate(n,t,e,i);else for(var a=n.length-1;a>=0;a--)(r=n[a])&&(o=(s<3?r(o):s>3?r(t,e,o):r(t,e))||o);return s>3&&o&&Object.defineProperty(t,e,o),o},w;let u=w=class extends v{firstUpdated(){this.startOTPTimeout()}disconnectedCallback(){clearTimeout(this.OTPTimeout)}constructor(){var t;super(),this.loading=!1,this.timeoutTimeLeft=g.getTimeToNextEmailLogin(),this.error="",this.otp="",this.email=(t=R.state.data)==null?void 0:t.email,this.authConnector=$.getAuthConnector()}render(){if(!this.email)throw new Error("w3m-email-otp-widget: No email provided");const t=!!this.timeoutTimeLeft,e=this.getFooterLabels(t);return l`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${["4","0","4","0"]}
        gap="4"
      >
        <wui-flex
          class="email-display"
          flexDirection="column"
          alignItems="center"
          .padding=${["0","5","0","5"]}
        >
          <wui-text variant="md-regular" color="primary" align="center">
            Enter the code we sent to
          </wui-text>
          <wui-text variant="md-medium" color="primary" lineClamp="1" align="center">
            ${this.email}
          </wui-text>
        </wui-flex>

        <wui-text variant="sm-regular" color="secondary">The code expires in 20 minutes</wui-text>

        ${this.loading?l`<wui-loading-spinner size="xl" color="accent-primary"></wui-loading-spinner>`:l` <wui-flex flexDirection="column" alignItems="center" gap="2">
              <wui-otp
                dissabled
                length="6"
                @inputChange=${this.onOtpInputChange.bind(this)}
                .otp=${this.otp}
              ></wui-otp>
              ${this.error?l`
                    <wui-text variant="sm-regular" align="center" color="error">
                      ${this.error}. Try Again
                    </wui-text>
                  `:null}
            </wui-flex>`}

        <wui-flex alignItems="center" gap="2">
          <wui-text variant="sm-regular" color="secondary">${e.title}</wui-text>
          <wui-link @click=${this.onResendCode.bind(this)} .disabled=${t}>
            ${e.action}
          </wui-link>
        </wui-flex>
      </wui-flex>
    `}startOTPTimeout(){this.timeoutTimeLeft=g.getTimeToNextEmailLogin(),this.OTPTimeout=setInterval(()=>{this.timeoutTimeLeft>0?this.timeoutTimeLeft=g.getTimeToNextEmailLogin():clearInterval(this.OTPTimeout)},1e3)}async onOtpInputChange(t){var e;try{this.loading||(this.otp=t.detail,this.shouldSubmitOnOtpChange()&&(this.loading=!0,await((e=this.onOtpSubmit)==null?void 0:e.call(this,this.otp))))}catch(i){this.error=S.parseError(i),this.loading=!1}}async onResendCode(){try{if(this.onOtpResend){if(!this.loading&&!this.timeoutTimeLeft){if(this.error="",this.otp="",!$.getAuthConnector()||!this.email)throw new Error("w3m-email-otp-widget: Unable to resend email");this.loading=!0,await this.onOtpResend(this.email),this.startOTPTimeout(),T.showSuccess("Code email resent")}}else this.onStartOver&&this.onStartOver()}catch(t){T.showError(t)}finally{this.loading=!1}}getFooterLabels(t){return this.onStartOver?{title:"Something wrong?",action:`Try again ${t?`in ${this.timeoutTimeLeft}s`:""}`}:{title:"Didn't receive it?",action:`Resend ${t?`in ${this.timeoutTimeLeft}s`:"Code"}`}}shouldSubmitOnOtpChange(){return this.authConnector&&this.otp.length===w.OTP_LENGTH}};u.OTP_LENGTH=6;u.styles=k;f([d()],u.prototype,"loading",void 0);f([d()],u.prototype,"timeoutTimeLeft",void 0);f([d()],u.prototype,"error",void 0);u=w=f([b("w3m-email-otp-widget")],u);export{u as W};
