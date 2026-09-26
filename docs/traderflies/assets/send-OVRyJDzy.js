import{cG as x,cJ as d,di as u,cK as b,cL as v,cN as H,d1 as O,c$ as g,cW as V,eh as a,cM as c,cP as L,cU as h,cS as E,cQ as I,dV as K,cV as y,d5 as Q,d4 as X,df as G,cH as Y,cI as J,dh as Z,eo as M,ep as q,cY as ee}from"./index-CJTqPxSt.js";import"./index-BUsIfOV_.js";import"./index-D76Vejot.js";import{S as P}from"./SwapController-BUFGSy9k.js";const te=x`
  :host {
    width: 100%;
    height: 100px;
    border-radius: ${({borderRadius:e})=>e[5]};
    border: 1px solid ${({tokens:e})=>e.theme.foregroundPrimary};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-1"]};
    will-change: background-color;
    position: relative;
  }

  :host(:hover) {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
  }

  wui-flex {
    width: 100%;
    height: fit-content;
  }

  wui-button {
    display: ruby;
    color: ${({tokens:e})=>e.theme.textPrimary};
    margin: 0 ${({spacing:e})=>e[2]};
  }

  .instruction {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2;
  }

  .paste {
    display: inline-flex;
  }

  textarea {
    background: transparent;
    width: 100%;
    font-family: ${({fontFamily:e})=>e.regular};
    font-style: normal;
    font-size: ${({textSize:e})=>e.large};
    font-weight: ${({fontWeight:e})=>e.regular};
    line-height: ${({typography:e})=>e["lg-regular"].lineHeight};
    letter-spacing: ${({typography:e})=>e["lg-regular"].letterSpacing};
    color: ${({tokens:e})=>e.theme.textPrimary};
    caret-color: ${({tokens:e})=>e.core.backgroundAccentPrimary};
    box-sizing: border-box;
    -webkit-appearance: none;
    -moz-appearance: textfield;
    padding: 0px;
    border: none;
    outline: none;
    appearance: none;
    resize: none;
    overflow: hidden;
  }
`;var D=function(e,t,i,o){var r=arguments.length,n=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,i):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,o);else for(var l=e.length-1;l>=0;l--)(s=e[l])&&(n=(r<3?s(n):r>3?s(t,i,n):s(t,i))||n);return r>3&&n&&Object.defineProperty(t,i,n),n};let A=class extends v{constructor(){super(...arguments),this.inputElementRef=H(),this.instructionElementRef=H(),this.readOnly=!1,this.instructionHidden=!!this.value,this.pasting=!1,this.onDebouncedSearch=O.debounce(async t=>{if(!t.length){this.setReceiverAddress("");return}const i=g.state.activeChain;if(O.isAddress(t,i)){this.setReceiverAddress(t);return}try{const r=await V.getEnsAddress(t);if(r){a.setReceiverProfileName(t),a.setReceiverAddress(r);const n=await V.getEnsAvatar(t);a.setReceiverProfileImageUrl(n||void 0)}}catch{this.setReceiverAddress(t)}finally{a.setLoading(!1)}})}firstUpdated(){this.value&&(this.instructionHidden=!0),this.checkHidden()}render(){return this.readOnly?c` <wui-flex
        flexDirection="column"
        justifyContent="center"
        gap="01"
        .padding=${["8","4","5","4"]}
      >
        <textarea
          spellcheck="false"
          ?disabled=${!0}
          autocomplete="off"
          .value=${this.value??""}
        ></textarea>
      </wui-flex>`:c` <wui-flex
      @click=${this.onBoxClick.bind(this)}
      flexDirection="column"
      justifyContent="center"
      gap="01"
      .padding=${["8","4","5","4"]}
    >
      <wui-text
        ${L(this.instructionElementRef)}
        class="instruction"
        color="secondary"
        variant="md-medium"
      >
        Type or
        <wui-button
          class="paste"
          size="md"
          variant="neutral-secondary"
          iconLeft="copy"
          @click=${this.onPasteClick.bind(this)}
        >
          <wui-icon size="sm" color="inherit" slot="iconLeft" name="copy"></wui-icon>
          Paste
        </wui-button>
        address
      </wui-text>
      <textarea
        spellcheck="false"
        ?disabled=${!this.instructionHidden}
        ${L(this.inputElementRef)}
        @input=${this.onInputChange.bind(this)}
        @blur=${this.onBlur.bind(this)}
        .value=${this.value??""}
        autocomplete="off"
      ></textarea>
    </wui-flex>`}async focusInput(){var t;this.instructionElementRef.value&&(this.instructionHidden=!0,await this.toggleInstructionFocus(!1),this.instructionElementRef.value.style.pointerEvents="none",(t=this.inputElementRef.value)==null||t.focus(),this.inputElementRef.value&&(this.inputElementRef.value.selectionStart=this.inputElementRef.value.selectionEnd=this.inputElementRef.value.value.length))}async focusInstruction(){var t;this.instructionElementRef.value&&(this.instructionHidden=!1,await this.toggleInstructionFocus(!0),this.instructionElementRef.value.style.pointerEvents="auto",(t=this.inputElementRef.value)==null||t.blur())}async toggleInstructionFocus(t){this.instructionElementRef.value&&await this.instructionElementRef.value.animate([{opacity:t?0:1},{opacity:t?1:0}],{duration:100,easing:"ease",fill:"forwards"}).finished}onBoxClick(){!this.value&&!this.instructionHidden&&this.focusInput()}onBlur(){!this.value&&this.instructionHidden&&!this.pasting&&this.focusInstruction()}checkHidden(){this.instructionHidden&&this.focusInput()}async onPasteClick(){this.pasting=!0;const t=await navigator.clipboard.readText();a.setReceiverAddress(t),this.focusInput()}onInputChange(t){var o;const i=t.target;this.pasting=!1,this.value=(o=t.target)==null?void 0:o.value,i.value&&!this.instructionHidden&&this.focusInput(),a.setLoading(!0),this.onDebouncedSearch(i.value)}setReceiverAddress(t){a.setReceiverAddress(t),a.setReceiverProfileName(void 0),a.setReceiverProfileImageUrl(void 0),a.setLoading(!1)}};A.styles=te;D([d()],A.prototype,"value",void 0);D([d({type:Boolean})],A.prototype,"readOnly",void 0);D([u()],A.prototype,"instructionHidden",void 0);D([u()],A.prototype,"pasting",void 0);A=D([b("w3m-input-address")],A);const ie=x`
  :host {
    width: 100%;
    height: 100px;
    border-radius: ${({borderRadius:e})=>e[5]};
    border: 1px solid ${({tokens:e})=>e.theme.foregroundPrimary};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-1"]};
    will-change: background-color;
    transition: all ${({easings:e})=>e["ease-out-power-1"]}
      ${({durations:e})=>e.lg};
  }

  :host(:hover) {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
  }

  wui-flex {
    width: 100%;
    height: fit-content;
  }

  wui-button {
    width: 100%;
    display: flex;
    justify-content: flex-end;
  }

  wui-input-amount {
    mask-image: linear-gradient(
      270deg,
      transparent 0px,
      transparent 8px,
      black 24px,
      black 25px,
      black 32px,
      black 100%
    );
  }

  .totalValue {
    width: 100%;
  }
`;var R=function(e,t,i,o){var r=arguments.length,n=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,i):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,o);else for(var l=e.length-1;l>=0;l--)(s=e[l])&&(n=(r<3?s(n):r>3?s(t,i,n):s(t,i))||n);return r>3&&n&&Object.defineProperty(t,i,n),n};let $=class extends v{constructor(){super(...arguments),this.readOnly=!1,this.isInsufficientBalance=!1}render(){const t=this.readOnly||!this.token;return c` <wui-flex
      flexDirection="column"
      gap="01"
      .padding=${["5","3","4","3"]}
    >
      <wui-flex alignItems="center">
        <wui-input-amount
          @inputChange=${this.onInputChange.bind(this)}
          ?disabled=${t}
          .value=${this.sendTokenAmount??""}
          ?error=${!!this.isInsufficientBalance}
        ></wui-input-amount>
        ${this.buttonTemplate()}
      </wui-flex>
      ${this.bottomTemplate()}
    </wui-flex>`}buttonTemplate(){return this.token?c`<wui-token-button
        text=${this.token.symbol}
        imageSrc=${this.token.iconUrl}
        @click=${this.handleSelectButtonClick.bind(this)}
      >
      </wui-token-button>`:c`<wui-button
      size="md"
      variant="neutral-secondary"
      @click=${this.handleSelectButtonClick.bind(this)}
      >Select token</wui-button
    >`}handleSelectButtonClick(){this.readOnly||h.push("WalletSendSelectToken")}sendValueTemplate(){if(!this.readOnly&&this.token&&this.sendTokenAmount){const i=this.token.price*Number(this.sendTokenAmount);return c`<wui-text class="totalValue" variant="sm-regular" color="secondary"
        >${i?`$${E.formatNumberToLocalString(i,2)}`:"Incorrect value"}</wui-text
      >`}return null}maxAmountTemplate(){return this.token?c` <wui-text variant="sm-regular" color="secondary">
        ${I.roundNumber(Number(this.token.quantity.numeric),6,5)}
      </wui-text>`:null}actionTemplate(){return this.token?c`<wui-link @click=${this.onMaxClick.bind(this)}>Max</wui-link>`:null}bottomTemplate(){return this.readOnly?null:c`<wui-flex alignItems="center" justifyContent="space-between">
      ${this.sendValueTemplate()}
      <wui-flex alignItems="center" gap="01" justifyContent="flex-end">
        ${this.maxAmountTemplate()} ${this.actionTemplate()}
      </wui-flex>
    </wui-flex>`}onInputChange(t){a.setTokenAmount(String(t.detail))}onMaxClick(){if(this.token){const t=Number(this.token.quantity.decimals),i=E.bigNumber(this.token.quantity.numeric);if(!this.token.address&&this.gasPrice){const r=65000n*BigInt(this.gasPrice),n=E.bigNumber(r.toString()).div(E.bigNumber(10).pow(t)),s=i.minus(n);a.setTokenAmount(s.gt(0)?s.toFixed(t,0):"0")}else a.setTokenAmount(i.toFixed(t,0))}}};$.styles=ie;R([d({type:Object})],$.prototype,"token",void 0);R([d({type:Boolean})],$.prototype,"readOnly",void 0);R([d({type:String})],$.prototype,"sendTokenAmount",void 0);R([d({type:Boolean})],$.prototype,"isInsufficientBalance",void 0);R([d({type:String})],$.prototype,"gasPrice",void 0);$=R([b("w3m-input-token")],$);const ne=x`
  :host {
    display: block;
  }

  wui-flex {
    position: relative;
  }

  wui-icon-box {
    width: 32px;
    height: 32px;
    border-radius: ${({borderRadius:e})=>e[10]} !important;
    border: 4px solid ${({tokens:e})=>e.theme.backgroundPrimary};
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 3;
  }

  wui-button {
    --local-border-radius: ${({borderRadius:e})=>e[4]} !important;
  }

  .inputContainer {
    height: fit-content;
  }
`;var w=function(e,t,i,o){var r=arguments.length,n=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,i):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,o);else for(var l=e.length-1;l>=0;l--)(s=e[l])&&(n=(r<3?s(n):r>3?s(t,i,n):s(t,i))||n);return r>3&&n&&Object.defineProperty(t,i,n),n};const m={INSUFFICIENT_FUNDS:"Insufficient Funds",INCORRECT_VALUE:"Incorrect Value",INVALID_ADDRESS:"Invalid Address",ADD_ADDRESS:"Add Address",ADD_AMOUNT:"Add Amount",SELECT_TOKEN:"Select Token",PREVIEW_SEND:"Preview Send"};let f=class extends v{constructor(){var i,o;super(),this.unsubscribe=[],this.isTryingToChooseDifferentWallet=!1,this.token=a.state.token,this.sendTokenAmount=a.state.sendTokenAmount,this.receiverAddress=a.state.receiverAddress,this.receiverProfileName=a.state.receiverProfileName,this.loading=a.state.loading,this.params=(i=h.state.data)==null?void 0:i.send,this.caipAddress=(o=g.getAccountData())==null?void 0:o.caipAddress,this.disconnecting=!1,this.gasFee=P.state.gasFee,this.token&&!this.params&&(this.fetchBalances(),this.fetchNetworkPrice());const t=g.subscribeKey("activeCaipAddress",r=>{!r&&this.isTryingToChooseDifferentWallet&&(this.isTryingToChooseDifferentWallet=!1,K.open({view:"Connect",data:{redirectView:"WalletSend"}}).catch(()=>null),t())});this.unsubscribe.push(g.subscribeAccountStateProp("caipAddress",r=>{this.caipAddress=r}),a.subscribe(r=>{this.token=r.token,this.sendTokenAmount=r.sendTokenAmount,this.receiverAddress=r.receiverAddress,this.receiverProfileName=r.receiverProfileName,this.loading=r.loading}),P.subscribeKey("gasFee",r=>{this.gasFee=r}))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}async firstUpdated(){await this.handleSendParameters()}render(){const t=this.getMessage(),i=!!this.params;return c` <wui-flex flexDirection="column" .padding=${["0","4","4","4"]}>
      <wui-flex class="inputContainer" gap="2" flexDirection="column">
        <w3m-input-token
          .token=${this.token}
          .sendTokenAmount=${this.sendTokenAmount}
          .gasPrice=${this.gasFee}
          ?readOnly=${i}
          ?isInsufficientBalance=${t===m.INSUFFICIENT_FUNDS}
        ></w3m-input-token>
        <wui-icon-box size="md" variant="secondary" icon="arrowBottom"></wui-icon-box>
        <w3m-input-address
          ?readOnly=${i}
          .value=${this.receiverProfileName?this.receiverProfileName:this.receiverAddress}
        ></w3m-input-address>
      </wui-flex>
      ${this.buttonTemplate(t)}
    </wui-flex>`}async fetchBalances(){await a.fetchTokenBalance(),a.fetchNetworkBalance()}async fetchNetworkPrice(){await P.getNetworkTokenPrice(),await P.getInitialGasPrice()}onButtonClick(){h.push("WalletSendPreview",{send:this.params})}onFundWalletClick(){h.push("FundWallet",{redirectView:"WalletSend"})}async onConnectDifferentWalletClick(){try{this.isTryingToChooseDifferentWallet=!0,this.disconnecting=!0,await V.disconnect()}finally{this.disconnecting=!1}}getMessage(){return this.token?this.sendTokenAmount?this.token.price&&!(Number(this.sendTokenAmount)*this.token.price)?m.INCORRECT_VALUE:E.bigNumber(this.sendTokenAmount).gt(this.token.quantity.numeric)?m.INSUFFICIENT_FUNDS:this.receiverAddress?O.isAddress(this.receiverAddress,g.state.activeChain)?m.PREVIEW_SEND:m.INVALID_ADDRESS:m.ADD_ADDRESS:m.ADD_AMOUNT:m.SELECT_TOKEN}buttonTemplate(t){const i=!t.startsWith(m.PREVIEW_SEND),o=t===m.INSUFFICIENT_FUNDS,r=!!this.params;return o&&!r?c`
        <wui-flex .margin=${["4","0","0","0"]} flexDirection="column" gap="4">
          <wui-button
            @click=${this.onFundWalletClick.bind(this)}
            size="lg"
            variant="accent-secondary"
            fullWidth
          >
            Fund Wallet
          </wui-button>

          <wui-separator data-testid="wui-separator" text="or"></wui-separator>

          <wui-button
            @click=${this.onConnectDifferentWalletClick.bind(this)}
            size="lg"
            variant="neutral-secondary"
            fullWidth
            ?loading=${this.disconnecting}
          >
            Connect a different wallet
          </wui-button>
        </wui-flex>
      `:c`<wui-flex .margin=${["4","0","0","0"]}>
      <wui-button
        @click=${this.onButtonClick.bind(this)}
        ?disabled=${i}
        size="lg"
        variant="accent-primary"
        ?loading=${this.loading}
        fullWidth
      >
        ${t}
      </wui-button>
    </wui-flex>`}async handleSendParameters(){if(this.loading=!0,!this.params){this.loading=!1;return}const t=Number(this.params.amount);if(isNaN(t)){y.showError("Invalid amount"),this.loading=!1;return}const{namespace:i,chainId:o,assetAddress:r}=this.params;if(!Q.SEND_PARAMS_SUPPORTED_CHAINS.includes(i)){y.showError(`Chain "${i}" is not supported for send parameters`),this.loading=!1;return}const n=g.getCaipNetworkById(o,i);if(!n){y.showError(`Network with id "${o}" not found`),this.loading=!1;return}try{const{balance:s,name:l,symbol:U,decimals:z}=await X.fetchERC20Balance({caipAddress:this.caipAddress,assetAddress:r,caipNetwork:n});if(!l||!U||!z||!s){y.showError("Token not found");return}a.setToken({name:l,symbol:U,chainId:n.id.toString(),address:`${n.chainNamespace}:${n.id}:${r}`,value:0,price:0,quantity:{decimals:z.toString(),numeric:s.toString()},iconUrl:G.getTokenImage(U)??""}),a.setTokenAmount(String(t)),a.setReceiverAddress(this.params.to)}catch(s){console.error("Failed to load token information:",s),y.showError("Failed to load token information")}finally{this.loading=!1}}};f.styles=ne;w([u()],f.prototype,"token",void 0);w([u()],f.prototype,"sendTokenAmount",void 0);w([u()],f.prototype,"receiverAddress",void 0);w([u()],f.prototype,"receiverProfileName",void 0);w([u()],f.prototype,"loading",void 0);w([u()],f.prototype,"params",void 0);w([u()],f.prototype,"caipAddress",void 0);w([u()],f.prototype,"disconnecting",void 0);w([u()],f.prototype,"gasFee",void 0);f=w([b("w3m-wallet-send-view")],f);const re=x`
  .contentContainer {
    height: 440px;
    overflow: scroll;
    scrollbar-width: none;
  }

  .contentContainer::-webkit-scrollbar {
    display: none;
  }

  wui-icon-box {
    width: 40px;
    height: 40px;
    border-radius: ${({borderRadius:e})=>e[3]};
  }
`;var _=function(e,t,i,o){var r=arguments.length,n=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,i):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,o);else for(var l=e.length-1;l>=0;l--)(s=e[l])&&(n=(r<3?s(n):r>3?s(t,i,n):s(t,i))||n);return r>3&&n&&Object.defineProperty(t,i,n),n};let C=class extends v{constructor(){super(),this.unsubscribe=[],this.tokenBalances=a.state.tokenBalances,this.search="",this.onDebouncedSearch=O.debounce(t=>{this.search=t}),this.fetchBalancesAndNetworkPrice(),this.unsubscribe.push(a.subscribe(t=>{this.tokenBalances=t.tokenBalances}))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){return c`
      <wui-flex flexDirection="column">
        ${this.templateSearchInput()} <wui-separator></wui-separator> ${this.templateTokens()}
      </wui-flex>
    `}async fetchBalancesAndNetworkPrice(){var t;(!this.tokenBalances||((t=this.tokenBalances)==null?void 0:t.length)===0)&&(await this.fetchBalances(),await this.fetchNetworkPrice())}async fetchBalances(){await a.fetchTokenBalance(),a.fetchNetworkBalance()}async fetchNetworkPrice(){await P.getNetworkTokenPrice()}templateSearchInput(){return c`
      <wui-flex gap="2" padding="3">
        <wui-input-text
          @inputChange=${this.onInputChange.bind(this)}
          class="network-search-input"
          size="sm"
          placeholder="Search token"
          icon="search"
        ></wui-input-text>
      </wui-flex>
    `}templateTokens(){var t,i;return this.tokens=(t=this.tokenBalances)==null?void 0:t.filter(o=>{var r;return o.chainId===((r=g.state.activeCaipNetwork)==null?void 0:r.caipNetworkId)}),this.search?this.filteredTokens=(i=this.tokenBalances)==null?void 0:i.filter(o=>o.name.toLowerCase().includes(this.search.toLowerCase())):this.filteredTokens=this.tokens,c`
      <wui-flex
        class="contentContainer"
        flexDirection="column"
        .padding=${["0","3","0","3"]}
      >
        <wui-flex justifyContent="flex-start" .padding=${["4","3","3","3"]}>
          <wui-text variant="md-medium" color="secondary">Your tokens</wui-text>
        </wui-flex>
        <wui-flex flexDirection="column" gap="2">
          ${this.filteredTokens&&this.filteredTokens.length>0?this.filteredTokens.map(o=>c`<wui-list-token
                    @click=${this.handleTokenClick.bind(this,o)}
                    ?clickable=${!0}
                    tokenName=${o.name}
                    tokenImageUrl=${o.iconUrl}
                    tokenAmount=${o.quantity.numeric}
                    tokenValue=${o.value}
                    tokenCurrency=${o.symbol}
                  ></wui-list-token>`):c`<wui-flex
                .padding=${["20","0","0","0"]}
                alignItems="center"
                flexDirection="column"
                gap="4"
              >
                <wui-icon-box icon="coinPlaceholder" color="default" size="lg"></wui-icon-box>
                <wui-flex
                  class="textContent"
                  gap="2"
                  flexDirection="column"
                  justifyContent="center"
                  flexDirection="column"
                >
                  <wui-text variant="lg-medium" align="center" color="primary">
                    No tokens found
                  </wui-text>
                  <wui-text variant="lg-regular" align="center" color="secondary">
                    Your tokens will appear here
                  </wui-text>
                </wui-flex>
                <wui-link @click=${this.onBuyClick.bind(this)}>Buy</wui-link>
              </wui-flex>`}
        </wui-flex>
      </wui-flex>
    `}onBuyClick(){h.push("OnRampProviders")}onInputChange(t){this.onDebouncedSearch(t.detail)}handleTokenClick(t){a.setToken(t),a.setTokenAmount(void 0),h.goBack()}};C.styles=re;_([u()],C.prototype,"tokenBalances",void 0);_([u()],C.prototype,"tokens",void 0);_([u()],C.prototype,"filteredTokens",void 0);_([u()],C.prototype,"search",void 0);C=_([b("w3m-wallet-send-select-token-view")],C);const oe=x`
  :host {
    height: 32px;
    display: flex;
    align-items: center;
    gap: ${({spacing:e})=>e[1]};
    border-radius: ${({borderRadius:e})=>e[32]};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    padding: ${({spacing:e})=>e[1]};
    padding-left: ${({spacing:e})=>e[2]};
  }

  wui-avatar,
  wui-image {
    width: 24px;
    height: 24px;
    border-radius: ${({borderRadius:e})=>e[16]};
  }

  wui-icon {
    border-radius: ${({borderRadius:e})=>e[16]};
  }
`;var B=function(e,t,i,o){var r=arguments.length,n=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,i):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,o);else for(var l=e.length-1;l>=0;l--)(s=e[l])&&(n=(r<3?s(n):r>3?s(t,i,n):s(t,i))||n);return r>3&&n&&Object.defineProperty(t,i,n),n};let S=class extends v{constructor(){super(...arguments),this.text=""}render(){return c`<wui-text variant="lg-regular" color="primary">${this.text}</wui-text>
      ${this.imageTemplate()}`}imageTemplate(){return this.address?c`<wui-avatar address=${this.address} .imageSrc=${this.imageSrc}></wui-avatar>`:this.imageSrc?c`<wui-image src=${this.imageSrc}></wui-image>`:c`<wui-icon size="lg" color="inverse" name="networkPlaceholder"></wui-icon>`}};S.styles=[Y,J,oe];B([d({type:String})],S.prototype,"text",void 0);B([d({type:String})],S.prototype,"address",void 0);B([d({type:String})],S.prototype,"imageSrc",void 0);S=B([b("wui-preview-item")],S);const se=x`
  :host {
    display: flex;
    padding: ${({spacing:e})=>e[4]} ${({spacing:e})=>e[3]};
    width: 100%;
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: ${({borderRadius:e})=>e[4]};
  }

  wui-image {
    width: 20px;
    height: 20px;
    border-radius: ${({borderRadius:e})=>e[16]};
  }

  wui-icon {
    width: 20px;
    height: 20px;
  }
`;var W=function(e,t,i,o){var r=arguments.length,n=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,i):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,o);else for(var l=e.length-1;l>=0;l--)(s=e[l])&&(n=(r<3?s(n):r>3?s(t,i,n):s(t,i))||n);return r>3&&n&&Object.defineProperty(t,i,n),n};let T=class extends v{constructor(){super(...arguments),this.imageSrc=void 0,this.textTitle="",this.textValue=void 0}render(){return c`
      <wui-flex justifyContent="space-between" alignItems="center">
        <wui-text variant="lg-regular" color="primary"> ${this.textTitle} </wui-text>
        ${this.templateContent()}
      </wui-flex>
    `}templateContent(){return this.imageSrc?c`<wui-image src=${this.imageSrc} alt=${this.textTitle}></wui-image>`:this.textValue?c` <wui-text variant="md-regular" color="secondary"> ${this.textValue} </wui-text>`:c`<wui-icon size="inherit" color="default" name="networkPlaceholder"></wui-icon>`}};T.styles=[Y,J,se];W([d()],T.prototype,"imageSrc",void 0);W([d()],T.prototype,"textTitle",void 0);W([d()],T.prototype,"textValue",void 0);T=W([b("wui-list-content")],T);const ae=x`
  :host {
    display: flex;
    width: auto;
    flex-direction: column;
    gap: ${({spacing:e})=>e[1]};
    border-radius: ${({borderRadius:e})=>e[5]};
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
    padding: ${({spacing:e})=>e[3]} ${({spacing:e})=>e[2]}
      ${({spacing:e})=>e[2]} ${({spacing:e})=>e[2]};
  }

  wui-list-content {
    width: -webkit-fill-available !important;
  }

  wui-text {
    padding: 0 ${({spacing:e})=>e[2]};
  }

  wui-flex {
    margin-top: ${({spacing:e})=>e[2]};
  }

  .network {
    cursor: pointer;
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-1"]};
    will-change: background-color;
  }

  .network:focus-visible {
    border: 1px solid ${({tokens:e})=>e.core.textAccentPrimary};
    background-color: ${({tokens:e})=>e.core.glass010};
    -webkit-box-shadow: 0px 0px 0px 4px ${({tokens:e})=>e.core.foregroundAccent010};
    -moz-box-shadow: 0px 0px 0px 4px ${({tokens:e})=>e.core.foregroundAccent010};
    box-shadow: 0px 0px 0px 4px ${({tokens:e})=>e.core.foregroundAccent010};
  }

  .network:hover {
    background-color: ${({tokens:e})=>e.core.glass010};
  }

  .network:active {
    background-color: ${({tokens:e})=>e.core.glass010};
  }
`;var j=function(e,t,i,o){var r=arguments.length,n=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,i):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,o);else for(var l=e.length-1;l>=0;l--)(s=e[l])&&(n=(r<3?s(n):r>3?s(t,i,n):s(t,i))||n);return r>3&&n&&Object.defineProperty(t,i,n),n};let N=class extends v{constructor(){var t;super(...arguments),this.params=(t=h.state.data)==null?void 0:t.send}render(){return c` <wui-text variant="sm-regular" color="secondary">Details</wui-text>
      <wui-flex flexDirection="column" gap="1">
        <wui-list-content
          textTitle="Address"
          textValue=${I.getTruncateString({string:this.receiverAddress??"",charsStart:4,charsEnd:4,truncate:"middle"})}
        >
        </wui-list-content>
        ${this.networkTemplate()}
      </wui-flex>`}networkTemplate(){var t;return(t=this.caipNetwork)!=null&&t.name?c` <wui-list-content
        @click=${()=>this.onNetworkClick(this.caipNetwork)}
        class="network"
        textTitle="Network"
        imageSrc=${Z(G.getNetworkImage(this.caipNetwork))}
      ></wui-list-content>`:null}onNetworkClick(t){t&&!this.params&&h.push("Networks",{network:t})}};N.styles=ae;j([d()],N.prototype,"receiverAddress",void 0);j([d({type:Object})],N.prototype,"caipNetwork",void 0);j([u()],N.prototype,"params",void 0);N=j([b("w3m-wallet-send-details")],N);const le=x`
  wui-avatar,
  wui-image {
    display: ruby;
    width: 32px;
    height: 32px;
    border-radius: ${({borderRadius:e})=>e[20]};
  }

  .sendButton {
    width: 70%;
    --local-width: 100% !important;
    --local-border-radius: ${({borderRadius:e})=>e[4]} !important;
  }

  .cancelButton {
    width: 30%;
    --local-width: 100% !important;
    --local-border-radius: ${({borderRadius:e})=>e[4]} !important;
  }
`;var k=function(e,t,i,o){var r=arguments.length,n=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,i):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,o);else for(var l=e.length-1;l>=0;l--)(s=e[l])&&(n=(r<3?s(n):r>3?s(t,i,n):s(t,i))||n);return r>3&&n&&Object.defineProperty(t,i,n),n};let p=class extends v{constructor(){var t;super(),this.unsubscribe=[],this.token=a.state.token,this.sendTokenAmount=a.state.sendTokenAmount,this.receiverAddress=a.state.receiverAddress,this.receiverProfileName=a.state.receiverProfileName,this.receiverProfileImageUrl=a.state.receiverProfileImageUrl,this.caipNetwork=g.state.activeCaipNetwork,this.loading=a.state.loading,this.params=(t=h.state.data)==null?void 0:t.send,this.unsubscribe.push(a.subscribe(i=>{this.token=i.token,this.sendTokenAmount=i.sendTokenAmount,this.receiverAddress=i.receiverAddress,this.receiverProfileName=i.receiverProfileName,this.receiverProfileImageUrl=i.receiverProfileImageUrl,this.loading=i.loading}),g.subscribeKey("activeCaipNetwork",i=>this.caipNetwork=i))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){var t,i;return c` <wui-flex flexDirection="column" .padding=${["0","4","4","4"]}>
      <wui-flex gap="2" flexDirection="column" .padding=${["0","2","0","2"]}>
        <wui-flex alignItems="center" justifyContent="space-between">
          <wui-flex flexDirection="column" gap="01">
            <wui-text variant="sm-regular" color="secondary">Send</wui-text>
            ${this.sendValueTemplate()}
          </wui-flex>
          <wui-preview-item
            text="${this.sendTokenAmount?I.roundNumber(Number(this.sendTokenAmount),6,5):"unknown"} ${(t=this.token)==null?void 0:t.symbol}"
            .imageSrc=${(i=this.token)==null?void 0:i.iconUrl}
          ></wui-preview-item>
        </wui-flex>
        <wui-flex>
          <wui-icon color="default" size="md" name="arrowBottom"></wui-icon>
        </wui-flex>
        <wui-flex alignItems="center" justifyContent="space-between">
          <wui-text variant="sm-regular" color="secondary">To</wui-text>
          <wui-preview-item
            text="${this.receiverProfileName?I.getTruncateString({string:this.receiverProfileName,charsStart:20,charsEnd:0,truncate:"end"}):I.getTruncateString({string:this.receiverAddress?this.receiverAddress:"",charsStart:4,charsEnd:4,truncate:"middle"})}"
            address=${this.receiverAddress??""}
            .imageSrc=${this.receiverProfileImageUrl??void 0}
            .isAddress=${!0}
          ></wui-preview-item>
        </wui-flex>
      </wui-flex>
      <wui-flex flexDirection="column" .padding=${["6","0","0","0"]}>
        <w3m-wallet-send-details
          .caipNetwork=${this.caipNetwork}
          .receiverAddress=${this.receiverAddress}
        ></w3m-wallet-send-details>
        <wui-flex justifyContent="center" gap="1" .padding=${["3","0","0","0"]}>
          <wui-icon size="sm" color="default" name="warningCircle"></wui-icon>
          <wui-text variant="sm-regular" color="secondary">Review transaction carefully</wui-text>
        </wui-flex>
        <wui-flex justifyContent="center" gap="3" .padding=${["4","0","0","0"]}>
          <wui-button
            class="cancelButton"
            @click=${this.onCancelClick.bind(this)}
            size="lg"
            variant="neutral-secondary"
          >
            Cancel
          </wui-button>
          <wui-button
            class="sendButton"
            @click=${this.onSendClick.bind(this)}
            size="lg"
            variant="accent-primary"
            .loading=${this.loading}
          >
            Send
          </wui-button>
        </wui-flex>
      </wui-flex></wui-flex
    >`}sendValueTemplate(){if(!this.params&&this.token&&this.sendTokenAmount){const i=this.token.price*Number(this.sendTokenAmount);return c`<wui-text variant="md-regular" color="primary"
        >$${i.toFixed(2)}</wui-text
      >`}return null}async onSendClick(){if(!this.sendTokenAmount||!this.receiverAddress){y.showError("Please enter a valid amount and receiver address");return}try{await a.sendToken(),this.params?h.reset("WalletSendConfirmed"):(y.showSuccess("Transaction started"),h.replace("Account"))}catch(t){let i="Failed to send transaction";const o=t instanceof M&&t.originalName===q.PROVIDER_RPC_ERROR_NAME.USER_REJECTED_REQUEST,r=t instanceof M&&t.originalName===q.PROVIDER_RPC_ERROR_NAME.SEND_TRANSACTION_ERROR;(o||r)&&(i=t.message),ee.sendEvent({type:"track",event:o?"SEND_REJECTED":"SEND_ERROR",properties:a.getSdkEventProperties(t)}),y.showError(i)}}onCancelClick(){h.goBack()}};p.styles=le;k([u()],p.prototype,"token",void 0);k([u()],p.prototype,"sendTokenAmount",void 0);k([u()],p.prototype,"receiverAddress",void 0);k([u()],p.prototype,"receiverProfileName",void 0);k([u()],p.prototype,"receiverProfileImageUrl",void 0);k([u()],p.prototype,"caipNetwork",void 0);k([u()],p.prototype,"loading",void 0);k([u()],p.prototype,"params",void 0);p=k([b("w3m-wallet-send-preview-view")],p);const ce=x`
  .icon-box {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background-color: ${({spacing:e})=>e[16]};
    border: 8px solid ${({tokens:e})=>e.theme.borderPrimary};
    border-radius: ${({borderRadius:e})=>e.round};
  }
`;var ue=function(e,t,i,o){var r=arguments.length,n=r<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,i):o,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,o);else for(var l=e.length-1;l>=0;l--)(s=e[l])&&(n=(r<3?s(n):r>3?s(t,i,n):s(t,i))||n);return r>3&&n&&Object.defineProperty(t,i,n),n};let F=class extends v{constructor(){super(),this.unsubscribe=[],this.unsubscribe.push()}render(){return c`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        gap="4"
        .padding="${["1","3","4","3"]}"
      >
        <wui-flex justifyContent="center" alignItems="center" class="icon-box">
          <wui-icon size="xxl" color="success" name="checkmark"></wui-icon>
        </wui-flex>

        <wui-text variant="h6-medium" color="primary">You successfully sent asset</wui-text>

        <wui-button
          fullWidth
          @click=${this.onCloseClick.bind(this)}
          size="lg"
          variant="neutral-secondary"
        >
          Close
        </wui-button>
      </wui-flex>
    `}onCloseClick(){K.close()}};F.styles=ce;F=ue([b("w3m-send-confirmed-view")],F);export{F as W3mSendConfirmedView,C as W3mSendSelectTokenView,p as W3mWalletSendPreviewView,f as W3mWalletSendView};
