import{d8 as pt,d9 as ht,da as mt,cL as A,cM as c,cJ as p,dh as T,di as m,eM as Ft,ey as zt,cR as Ke}from"./index-CZOLnkrU.js";import{u as x,w as jt,R as w,l as I,e as z,a as P,E as M,x as ze,y as je,C as g,B as Ie,d as G,z as Ee,D as Ce,F as Mt,p as ot,G as Xt,c as B,M as L,I as qt,f as S,r as se,k as Xe,P as Zt,J as Jt,K as N,L as en,H as J,O as C,Q as It,j as q,v as $e,h as tn,A as Be,T as nn,U as on,V as sn}from"./core-ByvUAPdz.js";import{c as k,n as rn,U as Ze}from"./index-r5qbhlNA.js";const ue={getGasPriceInEther(e,t){const n=t*e;return Number(n)/1e18},getGasPriceInUSD(e,t,n){const o=ue.getGasPriceInEther(t,n);return x.bigNumber(e).times(o).toNumber()},getPriceImpact({sourceTokenAmount:e,sourceTokenPriceInUSD:t,toTokenPriceInUSD:n,toTokenAmount:o}){const s=x.bigNumber(e).times(t),i=x.bigNumber(o).times(n);return s.minus(i).div(s).times(100).toNumber()},getMaxSlippage(e,t){const n=x.bigNumber(e).div(100);return x.multiply(t,n).toNumber()},getProviderFee(e,t=.0085){return x.bigNumber(e).times(t).toString()},isInsufficientNetworkTokenForGas(e,t){const n=t||"0";return x.bigNumber(e).eq(0)?!0:x.bigNumber(x.bigNumber(n)).gt(e)},isInsufficientSourceTokenForSwap(e,t,n){var i,r;const o=(r=(i=n==null?void 0:n.find(a=>a.address===t))==null?void 0:i.quantity)==null?void 0:r.numeric;return x.bigNumber(o||"0").lt(e)}},Et=15e4,an=6,D={initializing:!1,initialized:!1,loadingPrices:!1,loadingQuote:!1,loadingApprovalTransaction:!1,loadingBuildTransaction:!1,loadingTransaction:!1,switchingTokens:!1,fetchError:!1,approvalTransaction:void 0,swapTransaction:void 0,transactionError:void 0,sourceToken:void 0,sourceTokenAmount:"",sourceTokenPriceInUSD:0,toToken:void 0,toTokenAmount:"",toTokenPriceInUSD:0,networkPrice:"0",networkBalanceInUSD:"0",networkTokenSymbol:"",inputError:void 0,slippage:ot.CONVERT_SLIPPAGE_TOLERANCE,tokens:void 0,popularTokens:void 0,suggestedTokens:void 0,foundTokens:void 0,myTokensWithBalance:void 0,tokensPriceMap:{},gasFee:"0",gasPriceInUSD:0,priceImpact:void 0,maxSlippage:void 0,providerFee:void 0},l=mt({...D}),Me={state:l,subscribe(e){return ht(l,()=>e(l))},subscribeKey(e,t){return pt(l,e,t)},getParams(){var d,y,E,O,W,K,X,j,Se;const e=g.state.activeChain,t=((d=g.getAccountData(e))==null?void 0:d.caipAddress)??g.state.activeCaipAddress,n=G.getPlainAddress(t),o=Xt(),s=B.getConnectorId(g.state.activeChain);if(!n)throw new Error("No address found to swap the tokens from.");const i=!((y=l.toToken)!=null&&y.address)||!((E=l.toToken)!=null&&E.decimals),r=!((O=l.sourceToken)!=null&&O.address)||!((W=l.sourceToken)!=null&&W.decimals)||!x.bigNumber(l.sourceTokenAmount).gt(0),a=!l.sourceTokenAmount;return{networkAddress:o,fromAddress:n,fromCaipAddress:t,sourceTokenAddress:(K=l.sourceToken)==null?void 0:K.address,toTokenAddress:(X=l.toToken)==null?void 0:X.address,toTokenAmount:l.toTokenAmount,toTokenDecimals:(j=l.toToken)==null?void 0:j.decimals,sourceTokenAmount:l.sourceTokenAmount,sourceTokenDecimals:(Se=l.sourceToken)==null?void 0:Se.decimals,invalidToToken:i,invalidSourceToken:r,invalidSourceTokenAmount:a,availableToSwap:t&&!i&&!r&&!a,isAuthConnector:s===P.CONNECTOR_ID.AUTH}},async setSourceToken(e){if(!e){l.sourceToken=e,l.sourceTokenAmount="",l.sourceTokenPriceInUSD=0;return}l.sourceToken=e,await f.setTokenPrice(e.address,"sourceToken")},setSourceTokenAmount(e){l.sourceTokenAmount=e},async setToToken(e){if(!e){l.toToken=e,l.toTokenAmount="",l.toTokenPriceInUSD=0;return}l.toToken=e,await f.setTokenPrice(e.address,"toToken")},setToTokenAmount(e){l.toTokenAmount=e?x.toFixed(e,an):""},async setTokenPrice(e,t){let n=l.tokensPriceMap[e]||0;n||(l.loadingPrices=!0,n=await f.getAddressPrice(e)),t==="sourceToken"?l.sourceTokenPriceInUSD=n:t==="toToken"&&(l.toTokenPriceInUSD=n),l.loadingPrices&&(l.loadingPrices=!1),f.getParams().availableToSwap&&!l.switchingTokens&&f.swapTokens()},async switchTokens(){if(!(l.initializing||!l.initialized||l.switchingTokens)){l.switchingTokens=!0;try{const e=l.toToken?{...l.toToken}:void 0,t=l.sourceToken?{...l.sourceToken}:void 0,n=e&&l.toTokenAmount===""?"1":l.toTokenAmount;f.setSourceTokenAmount(n),f.setToTokenAmount(""),await f.setSourceToken(e),await f.setToToken(t),l.switchingTokens=!1,f.swapTokens()}catch(e){throw l.switchingTokens=!1,e}}},resetState(){l.myTokensWithBalance=D.myTokensWithBalance,l.tokensPriceMap=D.tokensPriceMap,l.initialized=D.initialized,l.initializing=D.initializing,l.switchingTokens=D.switchingTokens,l.sourceToken=D.sourceToken,l.sourceTokenAmount=D.sourceTokenAmount,l.sourceTokenPriceInUSD=D.sourceTokenPriceInUSD,l.toToken=D.toToken,l.toTokenAmount=D.toTokenAmount,l.toTokenPriceInUSD=D.toTokenPriceInUSD,l.networkPrice=D.networkPrice,l.networkTokenSymbol=D.networkTokenSymbol,l.networkBalanceInUSD=D.networkBalanceInUSD,l.inputError=D.inputError},resetValues(){var n;const{networkAddress:e}=f.getParams(),t=(n=l.tokens)==null?void 0:n.find(o=>o.address===e);f.setSourceToken(t),f.setToToken(void 0)},getApprovalLoadingState(){return l.loadingApprovalTransaction},clearError(){l.transactionError=void 0},async initializeState(){if(!l.initializing){if(l.initializing=!0,!l.initialized)try{await f.fetchTokens(),l.initialized=!0}catch{l.initialized=!1,I.showError("Failed to initialize swap"),w.goBack()}l.initializing=!1}},async fetchTokens(){var n;const{networkAddress:e}=f.getParams();await f.getNetworkTokenPrice(),await f.getMyTokensWithBalance();const t=(n=l.myTokensWithBalance)==null?void 0:n.find(o=>o.address===e);t&&(l.networkTokenSymbol=t.symbol,f.setSourceToken(t),f.setSourceTokenAmount("0"))},async getTokenList(){var t,n;const e=(t=g.state.activeCaipNetwork)==null?void 0:t.caipNetworkId;if(!(l.caipNetworkId===e&&l.tokens))try{l.tokensLoading=!0;const o=await Ee.getTokenList(e);l.tokens=o,l.caipNetworkId=e,l.popularTokens=o.sort((d,y)=>d.symbol<y.symbol?-1:d.symbol>y.symbol?1:0);const i=(e&&((n=ot.SUGGESTED_TOKENS_BY_CHAIN)==null?void 0:n[e])||[]).map(d=>o.find(y=>y.symbol===d)).filter(d=>!!d),a=(ot.SWAP_SUGGESTED_TOKENS||[]).map(d=>o.find(y=>y.symbol===d)).filter(d=>!!d).filter(d=>!i.some(y=>y.address===d.address));l.suggestedTokens=[...i,...a]}catch{l.tokens=[],l.popularTokens=[],l.suggestedTokens=[]}finally{l.tokensLoading=!1}},async getAddressPrice(e){var d,y;const t=l.tokensPriceMap[e];if(t)return t;const n=await Ie.fetchTokenPrice({addresses:[e]}),o=(n==null?void 0:n.fungibles)||[],s=[...l.tokens||[],...l.myTokensWithBalance||[]],i=(d=s==null?void 0:s.find(E=>E.address===e))==null?void 0:d.symbol,r=((y=o.find(E=>E.symbol.toLowerCase()===(i==null?void 0:i.toLowerCase())))==null?void 0:y.price)||0,a=parseFloat(r.toString());return l.tokensPriceMap[e]=a,a},async getNetworkTokenPrice(){var s;const{networkAddress:e}=f.getParams(),n=(s=(await Ie.fetchTokenPrice({addresses:[e]}).catch(()=>(I.showError("Failed to fetch network token price"),{fungibles:[]}))).fungibles)==null?void 0:s[0],o=(n==null?void 0:n.price.toString())||"0";l.tokensPriceMap[e]=parseFloat(o),l.networkTokenSymbol=(n==null?void 0:n.symbol)||"",l.networkPrice=o},async getMyTokensWithBalance(e){var o;const t=await Mt.getMyTokensWithBalance({forceUpdate:e,caipNetwork:g.state.activeCaipNetwork,address:(o=g.getAccountData())==null?void 0:o.address}),n=Ee.mapBalancesToSwapTokens(t);n&&(await f.getInitialGasPrice(),f.setBalances(n))},setBalances(e){const{networkAddress:t}=f.getParams(),n=g.state.activeCaipNetwork;if(!n)return;const o=e.find(s=>s.address===t);e.forEach(s=>{l.tokensPriceMap[s.address]=s.price||0}),l.myTokensWithBalance=e.filter(s=>s.address.startsWith(n.caipNetworkId)),l.networkBalanceInUSD=o?x.multiply(o.quantity.numeric,o.price).toString():"0"},async getInitialGasPrice(){var t,n;const e=await Ee.fetchGasPrice();if(!e)return{gasPrice:null,gasPriceInUSD:null};switch((n=(t=g.state)==null?void 0:t.activeCaipNetwork)==null?void 0:n.chainNamespace){case P.CHAIN.SOLANA:return l.gasFee=e.standard??"0",l.gasPriceInUSD=x.multiply(e.standard,l.networkPrice).div(1e9).toNumber(),{gasPrice:BigInt(l.gasFee),gasPriceInUSD:Number(l.gasPriceInUSD)};case P.CHAIN.EVM:default:const o=e.standard??"0",s=BigInt(o),i=BigInt(Et),r=ue.getGasPriceInUSD(l.networkPrice,i,s);return l.gasFee=o,l.gasPriceInUSD=r,{gasPrice:s,gasPriceInUSD:r}}},async swapTokens(){var i,r,a;const e=(i=g.getAccountData())==null?void 0:i.address,t=l.sourceToken,n=l.toToken,o=x.bigNumber(l.sourceTokenAmount).gt(0);if(o||f.setToTokenAmount(""),!n||!t||l.loadingPrices||!o||!e)return;l.loadingQuote=!0;const s=x.bigNumber(l.sourceTokenAmount).times(10**t.decimals).round(0).toFixed(0);try{const d=await Ie.fetchSwapQuote({userAddress:e,from:t.address,to:n.address,gasPrice:l.gasFee,amount:s.toString()});l.loadingQuote=!1;const y=(a=(r=d==null?void 0:d.quotes)==null?void 0:r[0])==null?void 0:a.toAmount;if(!y){Ce.open({displayMessage:"Incorrect amount",debugMessage:"Please enter a valid amount"},"error");return}const E=x.bigNumber(y).div(10**n.decimals).toString();f.setToTokenAmount(E),f.hasInsufficientToken(l.sourceTokenAmount,t.address)?l.inputError="Insufficient balance":(l.inputError=void 0,f.setTransactionDetails())}catch(d){const y=await Ee.handleSwapError(d);l.loadingQuote=!1,l.inputError=y||"Insufficient balance"}},async getTransaction(){const{fromCaipAddress:e,availableToSwap:t}=f.getParams(),n=l.sourceToken,o=l.toToken;if(!(!e||!t||!n||!o||l.loadingQuote))try{l.loadingBuildTransaction=!0;const s=await Ee.fetchSwapAllowance({userAddress:e,tokenAddress:n.address,sourceTokenAmount:l.sourceTokenAmount,sourceTokenDecimals:n.decimals});let i;return s?i=await f.createSwapTransaction():i=await f.createAllowanceTransaction(),l.loadingBuildTransaction=!1,l.fetchError=!1,i}catch{w.goBack(),I.showError("Failed to check allowance"),l.loadingBuildTransaction=!1,l.approvalTransaction=void 0,l.swapTransaction=void 0,l.fetchError=!0;return}},async createAllowanceTransaction(){const{fromCaipAddress:e,sourceTokenAddress:t,toTokenAddress:n}=f.getParams();if(!(!e||!n)){if(!t)throw new Error("createAllowanceTransaction - No source token address found.");try{const o=await Ie.generateApproveCalldata({from:t,to:n,userAddress:e}),s=G.getPlainAddress(o.tx.from);if(!s)throw new Error("SwapController:createAllowanceTransaction - address is required");const i={data:o.tx.data,to:s,gasPrice:BigInt(o.tx.eip155.gasPrice),value:BigInt(o.tx.value),toAmount:l.toTokenAmount};return l.swapTransaction=void 0,l.approvalTransaction={data:i.data,to:i.to,gasPrice:i.gasPrice,value:i.value,toAmount:i.toAmount},{data:i.data,to:i.to,gasPrice:i.gasPrice,value:i.value,toAmount:i.toAmount}}catch{w.goBack(),I.showError("Failed to create approval transaction"),l.approvalTransaction=void 0,l.swapTransaction=void 0,l.fetchError=!0;return}}},async createSwapTransaction(){var r;const{networkAddress:e,fromCaipAddress:t,sourceTokenAmount:n}=f.getParams(),o=l.sourceToken,s=l.toToken;if(!t||!n||!o||!s)return;const i=(r=z.parseUnits(n,o.decimals))==null?void 0:r.toString();try{const a=await Ie.generateSwapCalldata({userAddress:t,from:o.address,to:s.address,amount:i,disableEstimate:!0}),d=o.address===e,y=BigInt(a.tx.eip155.gas),E=BigInt(a.tx.eip155.gasPrice),O=G.getPlainAddress(a.tx.to);if(!O)throw new Error("SwapController:createSwapTransaction - address is required");const W={data:a.tx.data,to:O,gas:y,gasPrice:E,value:BigInt(d?i??"0":"0"),toAmount:l.toTokenAmount};return l.gasPriceInUSD=ue.getGasPriceInUSD(l.networkPrice,y,E),l.approvalTransaction=void 0,l.swapTransaction=W,W}catch{w.goBack(),I.showError("Failed to create transaction"),l.approvalTransaction=void 0,l.swapTransaction=void 0,l.fetchError=!0;return}},onEmbeddedWalletApprovalSuccess(){I.showLoading("Approve limit increase in your wallet"),w.replace("SwapPreview")},async sendTransactionForApproval(e){var s,i,r;const{fromAddress:t,isAuthConnector:n}=f.getParams();l.loadingApprovalTransaction=!0,n?w.pushTransactionStack({onSuccess:f.onEmbeddedWalletApprovalSuccess}):I.showLoading("Approve limit increase in your wallet");try{await z.sendTransaction({address:t,to:e.to,data:e.data,value:e.value,chainNamespace:P.CHAIN.EVM}),await f.swapTokens(),await f.getTransaction(),l.approvalTransaction=void 0,l.loadingApprovalTransaction=!1}catch(a){const d=a;l.transactionError=d==null?void 0:d.displayMessage,l.loadingApprovalTransaction=!1,I.showError((d==null?void 0:d.displayMessage)||"Transaction error"),M.sendEvent({type:"track",event:"SWAP_APPROVAL_ERROR",properties:{message:(d==null?void 0:d.displayMessage)||(d==null?void 0:d.message)||"Unknown",network:((s=g.state.activeCaipNetwork)==null?void 0:s.caipNetworkId)||"",swapFromToken:((i=f.state.sourceToken)==null?void 0:i.symbol)||"",swapToToken:((r=f.state.toToken)==null?void 0:r.symbol)||"",swapFromAmount:f.state.sourceTokenAmount||"",swapToAmount:f.state.toTokenAmount||"",isSmartAccount:ze(P.CHAIN.EVM)===je.ACCOUNT_TYPES.SMART_ACCOUNT}})}},async sendTransactionForSwap(e){var r,a,d,y,E,O,W,K,X,j,Se,St;if(!e)return;const{fromAddress:t,toTokenAmount:n,isAuthConnector:o}=f.getParams();l.loadingTransaction=!0;const s=`Swapping ${(r=l.sourceToken)==null?void 0:r.symbol} to ${x.formatNumberToLocalString(n,3)} ${(a=l.toToken)==null?void 0:a.symbol}`,i=`Swapped ${(d=l.sourceToken)==null?void 0:d.symbol} to ${x.formatNumberToLocalString(n,3)} ${(y=l.toToken)==null?void 0:y.symbol}`;o?w.pushTransactionStack({onSuccess(){w.replace("Account"),I.showLoading(s),Me.resetState()}}):I.showLoading("Confirm transaction in your wallet");try{const et=[(E=l.sourceToken)==null?void 0:E.address,(O=l.toToken)==null?void 0:O.address].join(","),F=await z.sendTransaction({address:t,to:e.to,data:e.data,value:e.value,chainNamespace:P.CHAIN.EVM});return l.loadingTransaction=!1,I.showSuccess(i),M.sendEvent({type:"track",event:"SWAP_SUCCESS",properties:{network:((W=g.state.activeCaipNetwork)==null?void 0:W.caipNetworkId)||"",swapFromToken:((K=f.state.sourceToken)==null?void 0:K.symbol)||"",swapToToken:((X=f.state.toToken)==null?void 0:X.symbol)||"",swapFromAmount:f.state.sourceTokenAmount||"",swapToAmount:f.state.toTokenAmount||"",isSmartAccount:ze(P.CHAIN.EVM)===je.ACCOUNT_TYPES.SMART_ACCOUNT}}),Me.resetState(),o||w.replace("Account"),Me.getMyTokensWithBalance(et),F}catch(et){const F=et;l.transactionError=F==null?void 0:F.displayMessage,l.loadingTransaction=!1,I.showError((F==null?void 0:F.displayMessage)||"Transaction error"),M.sendEvent({type:"track",event:"SWAP_ERROR",properties:{message:(F==null?void 0:F.displayMessage)||(F==null?void 0:F.message)||"Unknown",network:((j=g.state.activeCaipNetwork)==null?void 0:j.caipNetworkId)||"",swapFromToken:((Se=f.state.sourceToken)==null?void 0:Se.symbol)||"",swapToToken:((St=f.state.toToken)==null?void 0:St.symbol)||"",swapFromAmount:f.state.sourceTokenAmount||"",swapToAmount:f.state.toTokenAmount||"",isSmartAccount:ze(P.CHAIN.EVM)===je.ACCOUNT_TYPES.SMART_ACCOUNT}});return}},hasInsufficientToken(e,t){return ue.isInsufficientSourceTokenForSwap(e,t,l.myTokensWithBalance)},setTransactionDetails(){const{toTokenAddress:e,toTokenDecimals:t}=f.getParams();!e||!t||(l.gasPriceInUSD=ue.getGasPriceInUSD(l.networkPrice,BigInt(l.gasFee),BigInt(Et)),l.priceImpact=ue.getPriceImpact({sourceTokenAmount:l.sourceTokenAmount,sourceTokenPriceInUSD:l.sourceTokenPriceInUSD,toTokenPriceInUSD:l.toTokenPriceInUSD,toTokenAmount:l.toTokenAmount}),l.maxSlippage=ue.getMaxSlippage(l.slippage,l.toTokenAmount),l.providerFee=ue.getProviderFee(l.sourceTokenAmount))}},f=jt(Me),Z=mt({message:"",open:!1,triggerRect:{width:0,height:0,top:0,left:0},variant:"shade"}),cn={state:Z,subscribe(e){return ht(Z,()=>e(Z))},subscribeKey(e,t){return pt(Z,e,t)},showTooltip({message:e,triggerRect:t,variant:n}){Z.open=!0,Z.message=e,Z.triggerRect=t,Z.variant=n},hide(){Z.open=!1,Z.message="",Z.triggerRect={width:0,height:0,top:0,left:0}}},H=jt(cn),Vt={isUnsupportedChainView(){return w.state.view==="UnsupportedChain"||w.state.view==="SwitchNetwork"&&w.state.history.includes("UnsupportedChain")},async safeClose(){if(this.isUnsupportedChainView()){L.shake();return}if(await qt.isSIWXCloseDisabled()){L.shake();return}(w.state.view==="DataCapture"||w.state.view==="DataCaptureOtpConfirm")&&z.disconnect(),L.close()}},Ct={interpolate(e,t,n){if(e.length!==2||t.length!==2)throw new Error("inputRange and outputRange must be an array of length 2");const o=e[0]||0,s=e[1]||0,i=t[0]||0,r=t[1]||0;return n<o?i:n>s?r:(r-i)/(s-o)*(n-o)+i}},ln=S`
  :host {
    display: block;
    border-radius: clamp(0px, ${({borderRadius:e})=>e[8]}, 44px);
    box-shadow: 0 0 0 1px ${({tokens:e})=>e.theme.foregroundPrimary};
    overflow: hidden;
  }
`;var un=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let st=class extends A{render(){return c`<slot></slot>`}};st.styles=[se,ln];st=un([k("wui-card")],st);const dn=S`
  :host {
    width: 100%;
  }

  :host > wui-flex {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${({spacing:e})=>e[2]};
    padding: ${({spacing:e})=>e[3]};
    border-radius: ${({borderRadius:e})=>e[6]};
    border: 1px solid ${({tokens:e})=>e.theme.borderPrimary};
    box-sizing: border-box;
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    box-shadow: 0px 0px 16px 0px rgba(0, 0, 0, 0.25);
    color: ${({tokens:e})=>e.theme.textPrimary};
  }

  :host > wui-flex[data-type='info'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};

      wui-icon {
        color: ${({tokens:e})=>e.theme.iconDefault};
      }
    }
  }
  :host > wui-flex[data-type='success'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.core.backgroundSuccess};

      wui-icon {
        color: ${({tokens:e})=>e.core.borderSuccess};
      }
    }
  }
  :host > wui-flex[data-type='warning'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.core.backgroundWarning};

      wui-icon {
        color: ${({tokens:e})=>e.core.borderWarning};
      }
    }
  }
  :host > wui-flex[data-type='error'] {
    .icon-box {
      background-color: ${({tokens:e})=>e.core.backgroundError};

      wui-icon {
        color: ${({tokens:e})=>e.core.borderError};
      }
    }
  }

  wui-flex {
    width: 100%;
  }

  wui-text {
    word-break: break-word;
    flex: 1;
  }

  .close {
    cursor: pointer;
    color: ${({tokens:e})=>e.theme.iconDefault};
  }

  .icon-box {
    height: 40px;
    width: 40px;
    border-radius: ${({borderRadius:e})=>e[2]};
    background-color: var(--local-icon-bg-value);
  }
`;var wt=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};const pn={info:"info",success:"checkmark",warning:"warningCircle",error:"warning"};let Ne=class extends A{constructor(){super(...arguments),this.message="",this.type="info"}render(){return c`
      <wui-flex
        data-type=${T(this.type)}
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        gap="2"
      >
        <wui-flex columnGap="2" flexDirection="row" alignItems="center">
          <wui-flex
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
            class="icon-box"
          >
            <wui-icon color="inherit" size="md" name=${pn[this.type]}></wui-icon>
          </wui-flex>
          <wui-text variant="md-medium" color="inherit" data-testid="wui-alertbar-text"
            >${this.message}</wui-text
          >
        </wui-flex>
        <wui-icon
          class="close"
          color="inherit"
          size="sm"
          name="close"
          @click=${this.onClose}
        ></wui-icon>
      </wui-flex>
    `}onClose(){Ce.close()}};Ne.styles=[se,dn];wt([p()],Ne.prototype,"message",void 0);wt([p()],Ne.prototype,"type",void 0);Ne=wt([k("wui-alertbar")],Ne);const hn=S`
  :host {
    display: block;
    position: absolute;
    top: ${({spacing:e})=>e[3]};
    left: ${({spacing:e})=>e[4]};
    right: ${({spacing:e})=>e[4]};
    opacity: 0;
    pointer-events: none;
  }
`;var Ht=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};const mn={info:{backgroundColor:"fg-350",iconColor:"fg-325",icon:"info"},success:{backgroundColor:"success-glass-reown-020",iconColor:"success-125",icon:"checkmark"},warning:{backgroundColor:"warning-glass-reown-020",iconColor:"warning-100",icon:"warningCircle"},error:{backgroundColor:"error-glass-reown-020",iconColor:"error-125",icon:"warning"}};let qe=class extends A{constructor(){super(),this.unsubscribe=[],this.open=Ce.state.open,this.onOpen(!0),this.unsubscribe.push(Ce.subscribeKey("open",t=>{this.open=t,this.onOpen(!1)}))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){const{message:t,variant:n}=Ce.state,o=mn[n];return c`
      <wui-alertbar
        message=${t}
        backgroundColor=${o==null?void 0:o.backgroundColor}
        iconColor=${o==null?void 0:o.iconColor}
        icon=${o==null?void 0:o.icon}
        type=${n}
      ></wui-alertbar>
    `}onOpen(t){this.open?(this.animate([{opacity:0,transform:"scale(0.85)"},{opacity:1,transform:"scale(1)"}],{duration:150,fill:"forwards",easing:"ease"}),this.style.cssText="pointer-events: auto"):t||(this.animate([{opacity:1,transform:"scale(1)"},{opacity:0,transform:"scale(0.85)"}],{duration:150,fill:"forwards",easing:"ease"}),this.style.cssText="pointer-events: none")}};qe.styles=hn;Ht([m()],qe.prototype,"open",void 0);qe=Ht([k("w3m-alertbar")],qe);const wn=S`
  :host {
    position: relative;
  }

  button {
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: transparent;
    padding: ${({spacing:e})=>e[1]};
  }

  /* -- Colors --------------------------------------------------- */
  button[data-type='accent'] wui-icon {
    color: ${({tokens:e})=>e.core.iconAccentPrimary};
  }

  button[data-type='neutral'][data-variant='primary'] wui-icon {
    color: ${({tokens:e})=>e.theme.iconInverse};
  }

  button[data-type='neutral'][data-variant='secondary'] wui-icon {
    color: ${({tokens:e})=>e.theme.iconDefault};
  }

  button[data-type='success'] wui-icon {
    color: ${({tokens:e})=>e.core.iconSuccess};
  }

  button[data-type='error'] wui-icon {
    color: ${({tokens:e})=>e.core.iconError};
  }

  /* -- Sizes --------------------------------------------------- */
  button[data-size='xs'] {
    width: 16px;
    height: 16px;

    border-radius: ${({borderRadius:e})=>e[1]};
  }

  button[data-size='sm'] {
    width: 20px;
    height: 20px;
    border-radius: ${({borderRadius:e})=>e[1]};
  }

  button[data-size='md'] {
    width: 24px;
    height: 24px;
    border-radius: ${({borderRadius:e})=>e[2]};
  }

  button[data-size='lg'] {
    width: 28px;
    height: 28px;
    border-radius: ${({borderRadius:e})=>e[2]};
  }

  button[data-size='xs'] wui-icon {
    width: 8px;
    height: 8px;
  }

  button[data-size='sm'] wui-icon {
    width: 12px;
    height: 12px;
  }

  button[data-size='md'] wui-icon {
    width: 16px;
    height: 16px;
  }

  button[data-size='lg'] wui-icon {
    width: 20px;
    height: 20px;
  }

  /* -- Hover --------------------------------------------------- */
  @media (hover: hover) {
    button[data-type='accent']:hover:enabled {
      background-color: ${({tokens:e})=>e.core.foregroundAccent010};
    }

    button[data-variant='primary'][data-type='neutral']:hover:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }

    button[data-variant='secondary'][data-type='neutral']:hover:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }

    button[data-type='success']:hover:enabled {
      background-color: ${({tokens:e})=>e.core.backgroundSuccess};
    }

    button[data-type='error']:hover:enabled {
      background-color: ${({tokens:e})=>e.core.backgroundError};
    }
  }

  /* -- Focus --------------------------------------------------- */
  button:focus-visible {
    box-shadow: 0 0 0 4px ${({tokens:e})=>e.core.foregroundAccent020};
  }

  /* -- Properties --------------------------------------------------- */
  button[data-full-width='true'] {
    width: 100%;
  }

  :host([fullWidth]) {
    width: 100%;
  }

  button[disabled] {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;var we=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let ne=class extends A{constructor(){super(...arguments),this.icon="card",this.variant="primary",this.type="accent",this.size="md",this.iconSize=void 0,this.fullWidth=!1,this.disabled=!1}render(){return c`<button
      data-variant=${this.variant}
      data-type=${this.type}
      data-size=${this.size}
      data-full-width=${this.fullWidth}
      ?disabled=${this.disabled}
    >
      <wui-icon color="inherit" name=${this.icon} size=${T(this.iconSize)}></wui-icon>
    </button>`}};ne.styles=[se,Xe,wn];we([p()],ne.prototype,"icon",void 0);we([p()],ne.prototype,"variant",void 0);we([p()],ne.prototype,"type",void 0);we([p()],ne.prototype,"size",void 0);we([p()],ne.prototype,"iconSize",void 0);we([p({type:Boolean})],ne.prototype,"fullWidth",void 0);we([p({type:Boolean})],ne.prototype,"disabled",void 0);ne=we([k("wui-icon-button")],ne);const fn=S`
  button {
    display: block;
    display: flex;
    align-items: center;
    padding: ${({spacing:e})=>e[1]};
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color;
    border-radius: ${({borderRadius:e})=>e[32]};
  }

  wui-image {
    border-radius: 100%;
  }

  wui-text {
    padding-left: ${({spacing:e})=>e[1]};
  }

  .left-icon-container,
  .right-icon-container {
    width: 24px;
    height: 24px;
    justify-content: center;
    align-items: center;
  }

  wui-icon {
    color: ${({tokens:e})=>e.theme.iconDefault};
  }

  /* -- Sizes --------------------------------------------------- */
  button[data-size='lg'] {
    height: 32px;
  }

  button[data-size='md'] {
    height: 28px;
  }

  button[data-size='sm'] {
    height: 24px;
  }

  button[data-size='lg'] wui-image {
    width: 24px;
    height: 24px;
  }

  button[data-size='md'] wui-image {
    width: 20px;
    height: 20px;
  }

  button[data-size='sm'] wui-image {
    width: 16px;
    height: 16px;
  }

  button[data-size='lg'] .left-icon-container {
    width: 24px;
    height: 24px;
  }

  button[data-size='md'] .left-icon-container {
    width: 20px;
    height: 20px;
  }

  button[data-size='sm'] .left-icon-container {
    width: 16px;
    height: 16px;
  }

  /* -- Variants --------------------------------------------------------- */
  button[data-type='filled-dropdown'] {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  button[data-type='text-dropdown'] {
    background-color: transparent;
  }

  /* -- Focus states --------------------------------------------------- */
  button:focus-visible:enabled {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    box-shadow: 0 0 0 4px ${({tokens:e})=>e.core.foregroundAccent040};
  }

  /* -- Hover & Active states ----------------------------------------------------------- */
  @media (hover: hover) and (pointer: fine) {
    button:hover:enabled,
    button:active:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
  }

  /* -- Disabled states --------------------------------------------------- */
  button:disabled {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    opacity: 0.5;
  }
`;var ke=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};const gn={lg:"lg-regular",md:"md-regular",sm:"sm-regular"},yn={lg:"lg",md:"md",sm:"sm"};let pe=class extends A{constructor(){super(...arguments),this.imageSrc="",this.text="",this.size="lg",this.type="text-dropdown",this.disabled=!1}render(){return c`<button ?disabled=${this.disabled} data-size=${this.size} data-type=${this.type}>
      ${this.imageTemplate()} ${this.textTemplate()}
      <wui-flex class="right-icon-container">
        <wui-icon name="chevronBottom"></wui-icon>
      </wui-flex>
    </button>`}textTemplate(){const t=gn[this.size];return this.text?c`<wui-text color="primary" variant=${t}>${this.text}</wui-text>`:null}imageTemplate(){if(this.imageSrc)return c`<wui-image src=${this.imageSrc} alt="select visual"></wui-image>`;const t=yn[this.size];return c` <wui-flex class="left-icon-container">
      <wui-icon size=${t} name="networkPlaceholder"></wui-icon>
    </wui-flex>`}};pe.styles=[se,Xe,fn];ke([p()],pe.prototype,"imageSrc",void 0);ke([p()],pe.prototype,"text",void 0);ke([p()],pe.prototype,"size",void 0);ke([p()],pe.prototype,"type",void 0);ke([p({type:Boolean})],pe.prototype,"disabled",void 0);pe=ke([k("wui-select")],pe);const ye={ACCOUNT_TABS:[{label:"Tokens"},{label:"Activity"}],VIEW_DIRECTION:{Next:"next",Prev:"prev"},ANIMATION_DURATIONS:{HeaderText:120},VIEWS_WITH_LEGAL_FOOTER:["Connect","ConnectWallets","OnRampTokenSelect","OnRampFiatSelect","OnRampProviders"],VIEWS_WITH_DEFAULT_FOOTER:["Networks"]},bn=S`
  button {
    background-color: transparent;
    padding: ${({spacing:e})=>e[1]};
  }

  button:focus-visible {
    box-shadow: 0 0 0 4px ${({tokens:e})=>e.core.foregroundAccent020};
  }

  button[data-variant='accent']:hover:enabled,
  button[data-variant='accent']:focus-visible {
    background-color: ${({tokens:e})=>e.core.foregroundAccent010};
  }

  button[data-variant='primary']:hover:enabled,
  button[data-variant='primary']:focus-visible,
  button[data-variant='secondary']:hover:enabled,
  button[data-variant='secondary']:focus-visible {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
  }

  button[data-size='xs'] > wui-icon {
    width: 8px;
    height: 8px;
  }

  button[data-size='sm'] > wui-icon {
    width: 12px;
    height: 12px;
  }

  button[data-size='xs'],
  button[data-size='sm'] {
    border-radius: ${({borderRadius:e})=>e[1]};
  }

  button[data-size='md'],
  button[data-size='lg'] {
    border-radius: ${({borderRadius:e})=>e[2]};
  }

  button[data-size='md'] > wui-icon {
    width: 16px;
    height: 16px;
  }

  button[data-size='lg'] > wui-icon {
    width: 20px;
    height: 20px;
  }

  button:disabled {
    background-color: transparent;
    cursor: not-allowed;
    opacity: 0.5;
  }

  button:hover:not(:disabled) {
    background-color: var(--wui-color-accent-glass-015);
  }

  button:focus-visible:not(:disabled) {
    background-color: var(--wui-color-accent-glass-015);
    box-shadow:
      inset 0 0 0 1px var(--wui-color-accent-100),
      0 0 0 4px var(--wui-color-accent-glass-020);
  }
`;var Te=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let he=class extends A{constructor(){super(...arguments),this.size="md",this.disabled=!1,this.icon="copy",this.iconColor="default",this.variant="accent"}render(){const t={accent:"accent-primary",primary:"inverse",secondary:"default"};return c`
      <button data-variant=${this.variant} ?disabled=${this.disabled} data-size=${this.size}>
        <wui-icon
          color=${t[this.variant]||this.iconColor}
          size=${this.size}
          name=${this.icon}
        ></wui-icon>
      </button>
    `}};he.styles=[se,Xe,bn];Te([p()],he.prototype,"size",void 0);Te([p({type:Boolean})],he.prototype,"disabled",void 0);Te([p()],he.prototype,"icon",void 0);Te([p()],he.prototype,"iconColor",void 0);Te([p()],he.prototype,"variant",void 0);he=Te([k("wui-icon-link")],he);const vn=Ft`<svg width="86" height="96" fill="none">
  <path
    d="M78.3244 18.926L50.1808 2.45078C45.7376 -0.150261 40.2624 -0.150262 35.8192 2.45078L7.6756 18.926C3.23322 21.5266 0.5 26.3301 0.5 31.5248V64.4752C0.5 69.6699 3.23322 74.4734 7.6756 77.074L35.8192 93.5492C40.2624 96.1503 45.7376 96.1503 50.1808 93.5492L78.3244 77.074C82.7668 74.4734 85.5 69.6699 85.5 64.4752V31.5248C85.5 26.3301 82.7668 21.5266 78.3244 18.926Z"
  />
</svg>`,xn=Ft`
  <svg fill="none" viewBox="0 0 36 40">
    <path
      d="M15.4 2.1a5.21 5.21 0 0 1 5.2 0l11.61 6.7a5.21 5.21 0 0 1 2.61 4.52v13.4c0 1.87-1 3.59-2.6 4.52l-11.61 6.7c-1.62.93-3.6.93-5.22 0l-11.6-6.7a5.21 5.21 0 0 1-2.61-4.51v-13.4c0-1.87 1-3.6 2.6-4.52L15.4 2.1Z"
    />
  </svg>
`,kn=S`
  :host {
    position: relative;
    border-radius: inherit;
    display: flex;
    justify-content: center;
    align-items: center;
    width: var(--local-width);
    height: var(--local-height);
  }

  :host([data-round='true']) {
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: 100%;
    outline: 1px solid ${({tokens:e})=>e.core.glass010};
  }

  svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
  }

  svg > path {
    stroke: var(--local-stroke);
  }

  wui-image {
    width: 100%;
    height: 100%;
    -webkit-clip-path: var(--local-path);
    clip-path: var(--local-path);
    background: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  wui-icon {
    transform: translateY(-5%);
    width: var(--local-icon-size);
    height: var(--local-icon-size);
  }
`;var ve=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let le=class extends A{constructor(){super(...arguments),this.size="md",this.name="uknown",this.networkImagesBySize={sm:xn,md:rn,lg:vn},this.selected=!1,this.round=!1}render(){const t={sm:"4",md:"6",lg:"10"};return this.round?(this.dataset.round="true",this.style.cssText=`
      --local-width: var(--apkt-spacing-10);
      --local-height: var(--apkt-spacing-10);
      --local-icon-size: var(--apkt-spacing-4);
    `):this.style.cssText=`

      --local-path: var(--apkt-path-network-${this.size});
      --local-width:  var(--apkt-width-network-${this.size});
      --local-height:  var(--apkt-height-network-${this.size});
      --local-icon-size:  var(--apkt-spacing-${t[this.size]});
    `,c`${this.templateVisual()} ${this.svgTemplate()} `}svgTemplate(){return this.round?null:this.networkImagesBySize[this.size]}templateVisual(){return this.imageSrc?c`<wui-image src=${this.imageSrc} alt=${this.name}></wui-image>`:c`<wui-icon size="inherit" color="default" name="networkPlaceholder"></wui-icon>`}};le.styles=[se,kn];ve([p()],le.prototype,"size",void 0);ve([p()],le.prototype,"name",void 0);ve([p({type:Object})],le.prototype,"networkImagesBySize",void 0);ve([p()],le.prototype,"imageSrc",void 0);ve([p({type:Boolean})],le.prototype,"selected",void 0);ve([p({type:Boolean})],le.prototype,"round",void 0);le=ve([k("wui-network-image")],le);const Tn=S`
  :host {
    position: relative;
    display: flex;
    width: 100%;
    height: 1px;
    background-color: ${({tokens:e})=>e.theme.borderPrimary};
    justify-content: center;
    align-items: center;
  }

  :host > wui-text {
    position: absolute;
    padding: 0px 8px;
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color;
  }

  :host([data-bg-color='primary']) > wui-text {
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
  }

  :host([data-bg-color='secondary']) > wui-text {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }
`;var ft=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let _e=class extends A{constructor(){super(...arguments),this.text="",this.bgColor="primary"}render(){return this.dataset.bgColor=this.bgColor,c`${this.template()}`}template(){return this.text?c`<wui-text variant="md-regular" color="secondary">${this.text}</wui-text>`:null}};_e.styles=[se,Tn];ft([p()],_e.prototype,"text",void 0);ft([p()],_e.prototype,"bgColor",void 0);_e=ft([k("wui-separator")],_e);const b={INVALID_PAYMENT_CONFIG:"INVALID_PAYMENT_CONFIG",INVALID_RECIPIENT:"INVALID_RECIPIENT",INVALID_ASSET:"INVALID_ASSET",INVALID_AMOUNT:"INVALID_AMOUNT",UNKNOWN_ERROR:"UNKNOWN_ERROR",UNABLE_TO_INITIATE_PAYMENT:"UNABLE_TO_INITIATE_PAYMENT",INVALID_CHAIN_NAMESPACE:"INVALID_CHAIN_NAMESPACE",GENERIC_PAYMENT_ERROR:"GENERIC_PAYMENT_ERROR",UNABLE_TO_GET_EXCHANGES:"UNABLE_TO_GET_EXCHANGES",ASSET_NOT_SUPPORTED:"ASSET_NOT_SUPPORTED",UNABLE_TO_GET_PAY_URL:"UNABLE_TO_GET_PAY_URL",UNABLE_TO_GET_BUY_STATUS:"UNABLE_TO_GET_BUY_STATUS",UNABLE_TO_GET_TOKEN_BALANCES:"UNABLE_TO_GET_TOKEN_BALANCES",UNABLE_TO_GET_QUOTE:"UNABLE_TO_GET_QUOTE",UNABLE_TO_GET_QUOTE_STATUS:"UNABLE_TO_GET_QUOTE_STATUS",INVALID_RECIPIENT_ADDRESS_FOR_ASSET:"INVALID_RECIPIENT_ADDRESS_FOR_ASSET"},de={[b.INVALID_PAYMENT_CONFIG]:"Invalid payment configuration",[b.INVALID_RECIPIENT]:"Invalid recipient address",[b.INVALID_ASSET]:"Invalid asset specified",[b.INVALID_AMOUNT]:"Invalid payment amount",[b.INVALID_RECIPIENT_ADDRESS_FOR_ASSET]:"Invalid recipient address for the asset selected",[b.UNKNOWN_ERROR]:"Unknown payment error occurred",[b.UNABLE_TO_INITIATE_PAYMENT]:"Unable to initiate payment",[b.INVALID_CHAIN_NAMESPACE]:"Invalid chain namespace",[b.GENERIC_PAYMENT_ERROR]:"Unable to process payment",[b.UNABLE_TO_GET_EXCHANGES]:"Unable to get exchanges",[b.ASSET_NOT_SUPPORTED]:"Asset not supported by the selected exchange",[b.UNABLE_TO_GET_PAY_URL]:"Unable to get payment URL",[b.UNABLE_TO_GET_BUY_STATUS]:"Unable to get buy status",[b.UNABLE_TO_GET_TOKEN_BALANCES]:"Unable to get token balances",[b.UNABLE_TO_GET_QUOTE]:"Unable to get quote. Please choose a different token",[b.UNABLE_TO_GET_QUOTE_STATUS]:"Unable to get quote status"};class v extends Error{get message(){return de[this.code]}constructor(t,n){super(de[t]),this.name="AppKitPayError",this.code=t,this.details=n,Error.captureStackTrace&&Error.captureStackTrace(this,v)}}const An="https://rpc.walletconnect.org/v1/json-rpc",Pt="reown_test";function Sn(){const{chainNamespace:e}=N.parseCaipNetworkId(h.state.paymentAsset.network);if(!G.isAddress(h.state.recipient,e))throw new v(b.INVALID_RECIPIENT_ADDRESS_FOR_ASSET,`Provide valid recipient address for namespace "${e}"`)}async function In(e,t,n){var a;if(t!==P.CHAIN.EVM)throw new v(b.INVALID_CHAIN_NAMESPACE);if(!n.fromAddress)throw new v(b.INVALID_PAYMENT_CONFIG,"fromAddress is required for native EVM payments.");const o=typeof n.amount=="string"?parseFloat(n.amount):n.amount;if(isNaN(o))throw new v(b.INVALID_PAYMENT_CONFIG);const s=((a=e.metadata)==null?void 0:a.decimals)??18,i=z.parseUnits(o.toString(),s);if(typeof i!="bigint")throw new v(b.GENERIC_PAYMENT_ERROR);return await z.sendTransaction({chainNamespace:t,to:n.recipient,address:n.fromAddress,value:i,data:"0x"})??void 0}async function En(e,t){if(!t.fromAddress)throw new v(b.INVALID_PAYMENT_CONFIG,"fromAddress is required for ERC20 EVM payments.");const n=e.asset,o=t.recipient,s=Number(e.metadata.decimals),i=z.parseUnits(t.amount.toString(),s);if(i===void 0)throw new v(b.GENERIC_PAYMENT_ERROR);return await z.writeContract({fromAddress:t.fromAddress,tokenAddress:n,args:[o,i],method:"transfer",abi:Jt.getERC20Abi(n),chainNamespace:P.CHAIN.EVM})??void 0}async function Cn(e,t){if(e!==P.CHAIN.SOLANA)throw new v(b.INVALID_CHAIN_NAMESPACE);if(!t.fromAddress)throw new v(b.INVALID_PAYMENT_CONFIG,"fromAddress is required for Solana payments.");const n=typeof t.amount=="string"?parseFloat(t.amount):t.amount;if(isNaN(n)||n<=0)throw new v(b.INVALID_PAYMENT_CONFIG,"Invalid payment amount.");try{if(!Zt.getProvider(e))throw new v(b.GENERIC_PAYMENT_ERROR,"No Solana provider available.");const s=await z.sendTransaction({chainNamespace:P.CHAIN.SOLANA,to:t.recipient,value:n,tokenMint:t.tokenMint});if(!s)throw new v(b.GENERIC_PAYMENT_ERROR,"Transaction failed.");return s}catch(o){throw o instanceof v?o:new v(b.GENERIC_PAYMENT_ERROR,`Solana payment failed: ${o}`)}}async function Pn({sourceToken:e,toToken:t,amount:n,recipient:o}){const s=z.parseUnits(n,e.metadata.decimals),i=z.parseUnits(n,t.metadata.decimals);return Promise.resolve({type:at,origin:{amount:(s==null?void 0:s.toString())??"0",currency:e},destination:{amount:(i==null?void 0:i.toString())??"0",currency:t},fees:[{id:"service",label:"Service Fee",amount:"0",currency:t}],steps:[{requestId:at,type:"deposit",deposit:{amount:(s==null?void 0:s.toString())??"0",currency:e.asset,receiver:o}}],timeInSeconds:6})}function rt(e){if(!e)return null;const t=e.steps[0];return!t||t.type!==Mn?null:t}function tt(e,t=0){if(!e)return[];const n=e.steps.filter(s=>s.type===qn),o=n.filter((s,i)=>i+1>t);return n.length>0&&n.length<3?o:[]}const gt=new en({baseUrl:G.getApiUrl(),clientId:null});class $n extends Error{}function Nn(){const e=C.getSnapshot().projectId;return`${An}?projectId=${e}`}function yt(){const{projectId:e,sdkType:t,sdkVersion:n}=C.state;return{projectId:e,st:t||"appkit",sv:n||"html-wagmi-4.2.2"}}async function bt(e,t){const n=Nn(),{sdkType:o,sdkVersion:s,projectId:i}=C.getSnapshot(),r={jsonrpc:"2.0",id:1,method:e,params:{...t||{},st:o,sv:s,projectId:i}},d=await(await fetch(n,{method:"POST",body:JSON.stringify(r),headers:{"Content-Type":"application/json"}})).json();if(d.error)throw new $n(d.error.message);return d}async function $t(e){return(await bt("reown_getExchanges",e)).result}async function Nt(e){return(await bt("reown_getExchangePayUrl",e)).result}async function _n(e){return(await bt("reown_getExchangeBuyStatus",e)).result}async function Rn(e){const t=x.bigNumber(e.amount).times(10**e.toToken.metadata.decimals).toString(),{chainId:n,chainNamespace:o}=N.parseCaipNetworkId(e.sourceToken.network),{chainId:s,chainNamespace:i}=N.parseCaipNetworkId(e.toToken.network),r=e.sourceToken.asset==="native"?It(o):e.sourceToken.asset,a=e.toToken.asset==="native"?It(i):e.toToken.asset;return await gt.post({path:"/appkit/v1/transfers/quote",body:{user:e.address,originChainId:n.toString(),originCurrency:r,destinationChainId:s.toString(),destinationCurrency:a,recipient:e.recipient,amount:t},params:yt()})}async function On(e){const t=J.isLowerCaseMatch(e.sourceToken.network,e.toToken.network),n=J.isLowerCaseMatch(e.sourceToken.asset,e.toToken.asset);return t&&n?Pn(e):Rn(e)}async function Un(e){return await gt.get({path:"/appkit/v1/transfers/status",params:{requestId:e.requestId,...yt()}})}async function Wn(e){return await gt.get({path:`/appkit/v1/transfers/assets/exchanges/${e}`,params:yt()})}const Dn=["eip155","solana"],Ln={eip155:{native:{assetNamespace:"slip44",assetReference:"60"},defaultTokenNamespace:"erc20"},solana:{native:{assetNamespace:"slip44",assetReference:"501"},defaultTokenNamespace:"token"}},_t={56:"714",204:"714"};function nt(e,t){const{chainNamespace:n,chainId:o}=N.parseCaipNetworkId(e),s=Ln[n];if(!s)throw new Error(`Unsupported chain namespace for CAIP-19 formatting: ${n}`);let i=s.native.assetNamespace,r=s.native.assetReference;return t!=="native"?(i=s.defaultTokenNamespace,r=t):n==="eip155"&&_t[o]&&(r=_t[o]),`${`${n}:${o}`}/${i}:${r}`}function Bn(e){const{chainNamespace:t}=N.parseCaipNetworkId(e);return Dn.includes(t)}function Fn(e){const n=g.getAllRequestedCaipNetworks().find(s=>s.caipNetworkId===e.chainId);let o=e.address;if(!n)throw new Error(`Target network not found for balance chainId "${e.chainId}"`);if(J.isLowerCaseMatch(e.symbol,n.nativeCurrency.symbol))o="native";else if(G.isCaipAddress(o)){const{address:s}=N.parseCaipAddress(o);o=s}else if(!o)throw new Error(`Balance address not found for balance symbol "${e.symbol}"`);return{network:n.caipNetworkId,asset:o,metadata:{name:e.name,symbol:e.symbol,decimals:Number(e.quantity.decimals),logoURI:e.iconUrl},amount:e.quantity.numeric}}function zn(e){return{chainId:e.network,address:`${e.network}:${e.asset}`,symbol:e.metadata.symbol,name:e.metadata.name,iconUrl:e.metadata.logoURI||"",price:0,quantity:{numeric:"0",decimals:e.metadata.decimals.toString()}}}function Ve(e){const t=x.bigNumber(e,{safe:!0});return t.lt(.001)?"<0.001":t.round(4).toString()}function jn(e){const n=g.getAllRequestedCaipNetworks().find(o=>o.caipNetworkId===e.network);return n?!!n.testnet:!1}const Rt=0,it="unknown",at="direct-transfer",Mn="deposit",qn="transaction",u=mt({paymentAsset:{network:"eip155:1",asset:"0x0",metadata:{name:"0x0",symbol:"0x0",decimals:0}},recipient:"0x0",amount:0,isConfigured:!1,error:null,isPaymentInProgress:!1,exchanges:[],isLoading:!1,openInNewTab:!0,redirectUrl:void 0,payWithExchange:void 0,currentPayment:void 0,analyticsSet:!1,paymentId:void 0,choice:"pay",tokenBalances:{[P.CHAIN.EVM]:[],[P.CHAIN.SOLANA]:[]},isFetchingTokenBalances:!1,selectedPaymentAsset:null,quote:void 0,quoteStatus:"waiting",quoteError:null,isFetchingQuote:!1,selectedExchange:void 0,exchangeUrlForQuote:void 0,requestId:void 0}),h={state:u,subscribe(e){return ht(u,()=>e(u))},subscribeKey(e,t){return pt(u,e,t)},async handleOpenPay(e){this.resetState(),this.setPaymentConfig(e),this.initializeAnalytics(),Sn(),await this.prepareTokenLogo(),u.isConfigured=!0,M.sendEvent({type:"track",event:"PAY_MODAL_OPEN",properties:{exchanges:u.exchanges,configuration:{network:u.paymentAsset.network,asset:u.paymentAsset.asset,recipient:u.recipient,amount:u.amount}}}),await L.open({view:"Pay"})},resetState(){u.paymentAsset={network:"eip155:1",asset:"0x0",metadata:{name:"0x0",symbol:"0x0",decimals:0}},u.recipient="0x0",u.amount=0,u.isConfigured=!1,u.error=null,u.isPaymentInProgress=!1,u.isLoading=!1,u.currentPayment=void 0,u.selectedExchange=void 0,u.exchangeUrlForQuote=void 0,u.requestId=void 0},resetQuoteState(){u.quote=void 0,u.quoteStatus="waiting",u.quoteError=null,u.isFetchingQuote=!1,u.requestId=void 0},setPaymentConfig(e){if(!e.paymentAsset)throw new v(b.INVALID_PAYMENT_CONFIG);try{u.choice=e.choice??"pay",u.paymentAsset=e.paymentAsset,u.recipient=e.recipient,u.amount=e.amount,u.openInNewTab=e.openInNewTab??!0,u.redirectUrl=e.redirectUrl,u.payWithExchange=e.payWithExchange,u.error=null}catch(t){throw new v(b.INVALID_PAYMENT_CONFIG,t.message)}},setSelectedPaymentAsset(e){u.selectedPaymentAsset=e},setSelectedExchange(e){u.selectedExchange=e},setRequestId(e){u.requestId=e},setPaymentInProgress(e){u.isPaymentInProgress=e},getPaymentAsset(){return u.paymentAsset},getExchanges(){return u.exchanges},async fetchExchanges(){try{u.isLoading=!0;const e=await $t({page:Rt});u.exchanges=e.exchanges.slice(0,2)}catch{throw I.showError(de.UNABLE_TO_GET_EXCHANGES),new v(b.UNABLE_TO_GET_EXCHANGES)}finally{u.isLoading=!1}},async getAvailableExchanges(e){var t;try{const n=e!=null&&e.asset&&(e!=null&&e.network)?nt(e.network,e.asset):void 0;return await $t({page:(e==null?void 0:e.page)??Rt,asset:n,amount:(t=e==null?void 0:e.amount)==null?void 0:t.toString()})}catch{throw new v(b.UNABLE_TO_GET_EXCHANGES)}},async getPayUrl(e,t,n=!1){try{const o=Number(t.amount),s=await Nt({exchangeId:e,asset:nt(t.network,t.asset),amount:o.toString(),recipient:`${t.network}:${t.recipient}`});return M.sendEvent({type:"track",event:"PAY_EXCHANGE_SELECTED",properties:{source:"pay",exchange:{id:e},configuration:{network:t.network,asset:t.asset,recipient:t.recipient,amount:o},currentPayment:{type:"exchange",exchangeId:e},headless:n}}),n&&(this.initiatePayment(),M.sendEvent({type:"track",event:"PAY_INITIATED",properties:{source:"pay",paymentId:u.paymentId||it,configuration:{network:t.network,asset:t.asset,recipient:t.recipient,amount:o},currentPayment:{type:"exchange",exchangeId:e}}})),s}catch(o){throw o instanceof Error&&o.message.includes("is not supported")?new v(b.ASSET_NOT_SUPPORTED):new Error(o.message)}},async generateExchangeUrlForQuote({exchangeId:e,paymentAsset:t,amount:n,recipient:o}){const s=await Nt({exchangeId:e,asset:nt(t.network,t.asset),amount:n.toString(),recipient:o});u.exchangeSessionId=s.sessionId,u.exchangeUrlForQuote=s.url},async openPayUrl(e,t,n=!1){try{const o=await this.getPayUrl(e.exchangeId,t,n);if(!o)throw new v(b.UNABLE_TO_GET_PAY_URL);const i=e.openInNewTab??!0?"_blank":"_self";return G.openHref(o.url,i),o}catch(o){throw o instanceof v?u.error=o.message:u.error=de.GENERIC_PAYMENT_ERROR,new v(b.UNABLE_TO_GET_PAY_URL)}},async onTransfer({chainNamespace:e,fromAddress:t,toAddress:n,amount:o,paymentAsset:s}){if(u.currentPayment={type:"wallet",status:"IN_PROGRESS"},!u.isPaymentInProgress)try{this.initiatePayment();const r=g.getAllRequestedCaipNetworks().find(d=>d.caipNetworkId===s.network);if(!r)throw new Error("Target network not found");const a=g.state.activeCaipNetwork;switch(J.isLowerCaseMatch(a==null?void 0:a.caipNetworkId,r.caipNetworkId)||await g.switchActiveNetwork(r),e){case P.CHAIN.EVM:s.asset==="native"&&(u.currentPayment.result=await In(s,e,{recipient:n,amount:o,fromAddress:t})),s.asset.startsWith("0x")&&(u.currentPayment.result=await En(s,{recipient:n,amount:o,fromAddress:t})),u.currentPayment.status="SUCCESS";break;case P.CHAIN.SOLANA:u.currentPayment.result=await Cn(e,{recipient:n,amount:o,fromAddress:t,tokenMint:s.asset==="native"?void 0:s.asset}),u.currentPayment.status="SUCCESS";break;default:throw new v(b.INVALID_CHAIN_NAMESPACE)}}catch(i){throw i instanceof v?u.error=i.message:u.error=de.GENERIC_PAYMENT_ERROR,u.currentPayment.status="FAILED",I.showError(u.error),i}finally{u.isPaymentInProgress=!1}},async onSendTransaction(e){try{const{namespace:t,transactionStep:n}=e;h.initiatePayment();const s=g.getAllRequestedCaipNetworks().find(r=>{var a;return r.caipNetworkId===((a=u.paymentAsset)==null?void 0:a.network)});if(!s)throw new Error("Target network not found");const i=g.state.activeCaipNetwork;if(J.isLowerCaseMatch(i==null?void 0:i.caipNetworkId,s.caipNetworkId)||await g.switchActiveNetwork(s),t===P.CHAIN.EVM){const{from:r,to:a,data:d,value:y}=n.transaction;await z.sendTransaction({address:r,to:a,data:d,value:BigInt(y),chainNamespace:t})}else if(t===P.CHAIN.SOLANA){const{instructions:r}=n.transaction;await z.writeSolanaTransaction({instructions:r})}}catch(t){throw t instanceof v?u.error=t.message:u.error=de.GENERIC_PAYMENT_ERROR,I.showError(u.error),t}finally{u.isPaymentInProgress=!1}},getExchangeById(e){return u.exchanges.find(t=>t.id===e)},validatePayConfig(e){const{paymentAsset:t,recipient:n,amount:o}=e;if(!t)throw new v(b.INVALID_PAYMENT_CONFIG);if(!n)throw new v(b.INVALID_RECIPIENT);if(!t.asset)throw new v(b.INVALID_ASSET);if(o==null||o<=0)throw new v(b.INVALID_AMOUNT)},async handlePayWithExchange(e){try{u.currentPayment={type:"exchange",exchangeId:e};const{network:t,asset:n}=u.paymentAsset,o={network:t,asset:n,amount:u.amount,recipient:u.recipient},s=await this.getPayUrl(e,o);if(!s)throw new v(b.UNABLE_TO_INITIATE_PAYMENT);return u.currentPayment.sessionId=s.sessionId,u.currentPayment.status="IN_PROGRESS",u.currentPayment.exchangeId=e,this.initiatePayment(),{url:s.url,openInNewTab:u.openInNewTab}}catch(t){return t instanceof v?u.error=t.message:u.error=de.GENERIC_PAYMENT_ERROR,u.isPaymentInProgress=!1,I.showError(u.error),null}},async getBuyStatus(e,t){var n,o;try{const s=await _n({sessionId:t,exchangeId:e});return(s.status==="SUCCESS"||s.status==="FAILED")&&M.sendEvent({type:"track",event:s.status==="SUCCESS"?"PAY_SUCCESS":"PAY_ERROR",properties:{message:s.status==="FAILED"?G.parseError(u.error):void 0,source:"pay",paymentId:u.paymentId||it,configuration:{network:u.paymentAsset.network,asset:u.paymentAsset.asset,recipient:u.recipient,amount:u.amount},currentPayment:{type:"exchange",exchangeId:(n=u.currentPayment)==null?void 0:n.exchangeId,sessionId:(o=u.currentPayment)==null?void 0:o.sessionId,result:s.txHash}}}),s}catch{throw new v(b.UNABLE_TO_GET_BUY_STATUS)}},async fetchTokensFromEOA({caipAddress:e,caipNetwork:t,namespace:n}){if(!e)return[];const{address:o}=N.parseCaipAddress(e);let s=t;return n===P.CHAIN.EVM&&(s=void 0),await Mt.getMyTokensWithBalance({address:o,caipNetwork:s})},async fetchTokensFromExchange(){if(!u.selectedExchange)return[];const e=await Wn(u.selectedExchange.id),t=Object.values(e.assets).flat();return await Promise.all(t.map(async o=>{const s=zn(o),{chainNamespace:i}=N.parseCaipNetworkId(s.chainId);let r=s.address;if(G.isCaipAddress(r)){const{address:d}=N.parseCaipAddress(r);r=d}const a=await q.getImageByToken(r??"",i).catch(()=>{});return s.iconUrl=a??"",s}))},async fetchTokens({caipAddress:e,caipNetwork:t,namespace:n}){try{u.isFetchingTokenBalances=!0;const i=await(!!u.selectedExchange?this.fetchTokensFromExchange():this.fetchTokensFromEOA({caipAddress:e,caipNetwork:t,namespace:n}));u.tokenBalances={...u.tokenBalances,[n]:i}}catch(o){const s=o instanceof Error?o.message:"Unable to get token balances";I.showError(s)}finally{u.isFetchingTokenBalances=!1}},async fetchQuote({amount:e,address:t,sourceToken:n,toToken:o,recipient:s}){try{h.resetQuoteState(),u.isFetchingQuote=!0;const i=await On({amount:e,address:u.selectedExchange?void 0:t,sourceToken:n,toToken:o,recipient:s});if(u.selectedExchange){const r=rt(i);if(r){const a=`${n.network}:${r.deposit.receiver}`,d=x.formatNumber(r.deposit.amount,{decimals:n.metadata.decimals??0,round:8});await h.generateExchangeUrlForQuote({exchangeId:u.selectedExchange.id,paymentAsset:n,amount:d.toString(),recipient:a})}}u.quote=i}catch(i){let r=de.UNABLE_TO_GET_QUOTE;if(i instanceof Error&&i.cause&&i.cause instanceof Response)try{const a=await i.cause.json();a.error&&typeof a.error=="string"&&(r=a.error)}catch{}throw u.quoteError=r,I.showError(r),new v(b.UNABLE_TO_GET_QUOTE)}finally{u.isFetchingQuote=!1}},async fetchQuoteStatus({requestId:e}){try{if(e===at){const n=u.selectedExchange,o=u.exchangeSessionId;if(n&&o){switch((await this.getBuyStatus(n.id,o)).status){case"IN_PROGRESS":u.quoteStatus="waiting";break;case"SUCCESS":u.quoteStatus="success",u.isPaymentInProgress=!1;break;case"FAILED":u.quoteStatus="failure",u.isPaymentInProgress=!1;break;case"UNKNOWN":u.quoteStatus="waiting";break;default:u.quoteStatus="waiting";break}return}u.quoteStatus="success";return}const{status:t}=await Un({requestId:e});u.quoteStatus=t}catch{throw u.quoteStatus="failure",new v(b.UNABLE_TO_GET_QUOTE_STATUS)}},initiatePayment(){u.isPaymentInProgress=!0,u.paymentId=crypto.randomUUID()},initializeAnalytics(){u.analyticsSet||(u.analyticsSet=!0,this.subscribeKey("isPaymentInProgress",e=>{var t;if((t=u.currentPayment)!=null&&t.status&&u.currentPayment.status!=="UNKNOWN"){const n={IN_PROGRESS:"PAY_INITIATED",SUCCESS:"PAY_SUCCESS",FAILED:"PAY_ERROR"}[u.currentPayment.status];M.sendEvent({type:"track",event:n,properties:{message:u.currentPayment.status==="FAILED"?G.parseError(u.error):void 0,source:"pay",paymentId:u.paymentId||it,configuration:{network:u.paymentAsset.network,asset:u.paymentAsset.asset,recipient:u.recipient,amount:u.amount},currentPayment:{type:u.currentPayment.type,exchangeId:u.currentPayment.exchangeId,sessionId:u.currentPayment.sessionId,result:u.currentPayment.result}}})}}))},async prepareTokenLogo(){if(!u.paymentAsset.metadata.logoURI)try{const{chainNamespace:e}=N.parseCaipNetworkId(u.paymentAsset.network),t=await q.getImageByToken(u.paymentAsset.asset,e);u.paymentAsset.metadata.logoURI=t}catch{}}},Vn=S`
  wui-separator {
    margin: var(--apkt-spacing-3) calc(var(--apkt-spacing-3) * -1) var(--apkt-spacing-2)
      calc(var(--apkt-spacing-3) * -1);
    width: calc(100% + var(--apkt-spacing-3) * 2);
  }

  .token-display {
    padding: var(--apkt-spacing-3) var(--apkt-spacing-3);
    border-radius: var(--apkt-borderRadius-5);
    background-color: var(--apkt-tokens-theme-backgroundPrimary);
    margin-top: var(--apkt-spacing-3);
    margin-bottom: var(--apkt-spacing-3);
  }

  .token-display wui-text {
    text-transform: none;
  }

  wui-loading-spinner {
    padding: var(--apkt-spacing-2);
  }

  .left-image-container {
    position: relative;
    justify-content: center;
    align-items: center;
  }

  .token-image {
    border-radius: ${({borderRadius:e})=>e.round};
    width: 40px;
    height: 40px;
  }

  .chain-image {
    position: absolute;
    width: 20px;
    height: 20px;
    bottom: -3px;
    right: -5px;
    border-radius: ${({borderRadius:e})=>e.round};
    border: 2px solid ${({tokens:e})=>e.theme.backgroundPrimary};
  }

  .payment-methods-container {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-top-right-radius: ${({borderRadius:e})=>e[8]};
    border-top-left-radius: ${({borderRadius:e})=>e[8]};
  }
`;var fe=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let ie=class extends A{constructor(){super(),this.unsubscribe=[],this.amount=h.state.amount,this.namespace=void 0,this.paymentAsset=h.state.paymentAsset,this.activeConnectorIds=B.state.activeConnectorIds,this.caipAddress=void 0,this.exchanges=h.state.exchanges,this.isLoading=h.state.isLoading,this.initializeNamespace(),this.unsubscribe.push(h.subscribeKey("amount",t=>this.amount=t)),this.unsubscribe.push(B.subscribeKey("activeConnectorIds",t=>this.activeConnectorIds=t)),this.unsubscribe.push(h.subscribeKey("exchanges",t=>this.exchanges=t)),this.unsubscribe.push(h.subscribeKey("isLoading",t=>this.isLoading=t)),h.fetchExchanges(),h.setSelectedExchange(void 0)}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){return c`
      <wui-flex flexDirection="column">
        ${this.paymentDetailsTemplate()} ${this.paymentMethodsTemplate()}
      </wui-flex>
    `}paymentMethodsTemplate(){return c`
      <wui-flex flexDirection="column" padding="3" gap="2" class="payment-methods-container">
        ${this.payWithWalletTemplate()} ${this.templateSeparator()}
        ${this.templateExchangeOptions()}
      </wui-flex>
    `}initializeNamespace(){var n;const t=g.state.activeChain;this.namespace=t,this.caipAddress=(n=g.getAccountData(t))==null?void 0:n.caipAddress,this.unsubscribe.push(g.subscribeChainProp("accountState",o=>{this.caipAddress=o==null?void 0:o.caipAddress},t))}paymentDetailsTemplate(){const n=g.getAllRequestedCaipNetworks().find(o=>o.caipNetworkId===this.paymentAsset.network);return c`
      <wui-flex
        alignItems="center"
        justifyContent="space-between"
        .padding=${["6","8","6","8"]}
        gap="2"
      >
        <wui-flex alignItems="center" gap="1">
          <wui-text variant="h1-regular" color="primary">
            ${Ve(this.amount||"0")}
          </wui-text>

          <wui-flex flexDirection="column">
            <wui-text variant="h6-regular" color="secondary">
              ${this.paymentAsset.metadata.symbol||"Unknown"}
            </wui-text>
            <wui-text variant="md-medium" color="secondary"
              >on ${(n==null?void 0:n.name)||"Unknown"}</wui-text
            >
          </wui-flex>
        </wui-flex>

        <wui-flex class="left-image-container">
          <wui-image
            src=${T(this.paymentAsset.metadata.logoURI)}
            class="token-image"
          ></wui-image>
          <wui-image
            src=${T(q.getNetworkImage(n))}
            class="chain-image"
          ></wui-image>
        </wui-flex>
      </wui-flex>
    `}payWithWalletTemplate(){return Bn(this.paymentAsset.network)?this.caipAddress?this.connectedWalletTemplate():this.disconnectedWalletTemplate():c``}connectedWalletTemplate(){const{name:t,image:n}=this.getWalletProperties({namespace:this.namespace});return c`
      <wui-flex flexDirection="column" gap="3">
        <wui-list-item
          type="secondary"
          boxColor="foregroundSecondary"
          @click=${this.onWalletPayment}
          .boxed=${!1}
          ?chevron=${!0}
          ?fullSize=${!1}
          ?rounded=${!0}
          data-testid="wallet-payment-option"
          imageSrc=${T(n)}
          imageSize="3xl"
        >
          <wui-text variant="lg-regular" color="primary">Pay with ${t}</wui-text>
        </wui-list-item>

        <wui-list-item
          type="secondary"
          icon="power"
          iconColor="error"
          @click=${this.onDisconnect}
          data-testid="disconnect-button"
          ?chevron=${!1}
          boxColor="foregroundSecondary"
        >
          <wui-text variant="lg-regular" color="secondary">Disconnect</wui-text>
        </wui-list-item>
      </wui-flex>
    `}disconnectedWalletTemplate(){return c`<wui-list-item
      type="secondary"
      boxColor="foregroundSecondary"
      variant="icon"
      iconColor="default"
      iconVariant="overlay"
      icon="wallet"
      @click=${this.onWalletPayment}
      ?chevron=${!0}
      data-testid="wallet-payment-option"
    >
      <wui-text variant="lg-regular" color="primary">Pay with wallet</wui-text>
    </wui-list-item>`}templateExchangeOptions(){if(this.isLoading)return c`<wui-flex justifyContent="center" alignItems="center">
        <wui-loading-spinner size="md"></wui-loading-spinner>
      </wui-flex>`;const t=this.exchanges.filter(n=>jn(this.paymentAsset)?n.id===Pt:n.id!==Pt);return t.length===0?c`<wui-flex justifyContent="center" alignItems="center">
        <wui-text variant="md-medium" color="primary">No exchanges available</wui-text>
      </wui-flex>`:t.map(n=>c`
        <wui-list-item
          type="secondary"
          boxColor="foregroundSecondary"
          @click=${()=>this.onExchangePayment(n)}
          data-testid="exchange-option-${n.id}"
          ?chevron=${!0}
          imageSrc=${T(n.imageUrl)}
        >
          <wui-text flexGrow="1" variant="lg-regular" color="primary">
            Pay with ${n.name}
          </wui-text>
        </wui-list-item>
      `)}templateSeparator(){return c`<wui-separator text="or" bgColor="secondary"></wui-separator>`}async onWalletPayment(){if(!this.namespace)throw new Error("Namespace not found");this.caipAddress?w.push("PayQuote"):(await B.connect(),await L.open({view:"PayQuote"}))}onExchangePayment(t){h.setSelectedExchange(t),w.push("PayQuote")}async onDisconnect(){try{await z.disconnect(),await L.open({view:"Pay"})}catch{console.error("Failed to disconnect"),I.showError("Failed to disconnect")}}getWalletProperties({namespace:t}){if(!t)return{name:void 0,image:void 0};const n=this.activeConnectorIds[t];if(!n)return{name:void 0,image:void 0};const o=B.getConnector({id:n,namespace:t});if(!o)return{name:void 0,image:void 0};const s=q.getConnectorImage(o);return{name:o.name,image:s}}};ie.styles=Vn;fe([m()],ie.prototype,"amount",void 0);fe([m()],ie.prototype,"namespace",void 0);fe([m()],ie.prototype,"paymentAsset",void 0);fe([m()],ie.prototype,"activeConnectorIds",void 0);fe([m()],ie.prototype,"caipAddress",void 0);fe([m()],ie.prototype,"exchanges",void 0);fe([m()],ie.prototype,"isLoading",void 0);ie=fe([k("w3m-pay-view")],ie);const Hn=S`
  :host {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .pulse-container {
    position: relative;
    width: var(--pulse-size);
    height: var(--pulse-size);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pulse-rings {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .pulse-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid var(--pulse-color);
    opacity: 0;
    animation: pulse var(--pulse-duration, 2s) ease-out infinite;
  }

  .pulse-content {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  @keyframes pulse {
    0% {
      transform: scale(0.5);
      opacity: var(--pulse-opacity, 0.3);
    }
    50% {
      opacity: calc(var(--pulse-opacity, 0.3) * 0.5);
    }
    100% {
      transform: scale(1.2);
      opacity: 0;
    }
  }
`;var Ae=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};const Gn=3,Yn=2,Qn=.3,Kn="200px",Xn={"accent-primary":$e.tokens.core.backgroundAccentPrimary};let me=class extends A{constructor(){super(...arguments),this.rings=Gn,this.duration=Yn,this.opacity=Qn,this.size=Kn,this.variant="accent-primary"}render(){const t=Xn[this.variant];this.style.cssText=`
      --pulse-size: ${this.size};
      --pulse-duration: ${this.duration}s;
      --pulse-color: ${t};
      --pulse-opacity: ${this.opacity};
    `;const n=Array.from({length:this.rings},(o,s)=>this.renderRing(s,this.rings));return c`
      <div class="pulse-container">
        <div class="pulse-rings">${n}</div>
        <div class="pulse-content">
          <slot></slot>
        </div>
      </div>
    `}renderRing(t,n){const s=`animation-delay: ${t/n*this.duration}s;`;return c`<div class="pulse-ring" style=${s}></div>`}};me.styles=[se,Hn];Ae([p({type:Number})],me.prototype,"rings",void 0);Ae([p({type:Number})],me.prototype,"duration",void 0);Ae([p({type:Number})],me.prototype,"opacity",void 0);Ae([p()],me.prototype,"size",void 0);Ae([p()],me.prototype,"variant",void 0);me=Ae([k("wui-pulse")],me);const Ot=[{id:"received",title:"Receiving funds",icon:"dollar"},{id:"processing",title:"Swapping asset",icon:"recycleHorizontal"},{id:"sending",title:"Sending asset to the recipient address",icon:"send"}],Ut=["success","submitted","failure","timeout","refund"],Zn=S`
  :host {
    display: block;
    height: 100%;
    width: 100%;
  }

  wui-image {
    border-radius: ${({borderRadius:e})=>e.round};
  }

  .token-badge-container {
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
    border-radius: ${({borderRadius:e})=>e[4]};
    z-index: 3;
    min-width: 105px;
  }

  .token-badge-container.loading {
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    border: 3px solid ${({tokens:e})=>e.theme.backgroundPrimary};
  }

  .token-badge-container.success {
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    border: 3px solid ${({tokens:e})=>e.theme.backgroundPrimary};
  }

  .token-image-container {
    position: relative;
  }

  .token-image {
    border-radius: ${({borderRadius:e})=>e.round};
    width: 64px;
    height: 64px;
  }

  .token-image.success {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  .token-image.error {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  .token-image.loading {
    background: ${({colors:e})=>e.accent010};
  }

  .token-image wui-icon {
    width: 32px;
    height: 32px;
  }

  .token-badge {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border: 1px solid ${({tokens:e})=>e.theme.foregroundSecondary};
    border-radius: ${({borderRadius:e})=>e[4]};
  }

  .token-badge wui-text {
    white-space: nowrap;
  }

  .payment-lifecycle-container {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-top-right-radius: ${({borderRadius:e})=>e[6]};
    border-top-left-radius: ${({borderRadius:e})=>e[6]};
  }

  .payment-step-badge {
    padding: ${({spacing:e})=>e[1]} ${({spacing:e})=>e[2]};
    border-radius: ${({borderRadius:e})=>e[1]};
  }

  .payment-step-badge.loading {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
  }

  .payment-step-badge.error {
    background-color: ${({tokens:e})=>e.core.backgroundError};
  }

  .payment-step-badge.success {
    background-color: ${({tokens:e})=>e.core.backgroundSuccess};
  }

  .step-icon-container {
    position: relative;
    height: 40px;
    width: 40px;
    border-radius: ${({borderRadius:e})=>e.round};
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
  }

  .step-icon-box {
    position: absolute;
    right: -4px;
    bottom: -1px;
    padding: 2px;
    border-radius: ${({borderRadius:e})=>e.round};
    border: 2px solid ${({tokens:e})=>e.theme.backgroundPrimary};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  .step-icon-box.success {
    background-color: ${({tokens:e})=>e.core.backgroundSuccess};
  }
`;var re=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};const Jn={received:["pending","success","submitted"],processing:["success","submitted"],sending:["success","submitted"]},ei=3e3;let Y=class extends A{constructor(){super(),this.unsubscribe=[],this.pollingInterval=null,this.paymentAsset=h.state.paymentAsset,this.quoteStatus=h.state.quoteStatus,this.quote=h.state.quote,this.amount=h.state.amount,this.namespace=void 0,this.caipAddress=void 0,this.profileName=null,this.activeConnectorIds=B.state.activeConnectorIds,this.selectedExchange=h.state.selectedExchange,this.initializeNamespace(),this.unsubscribe.push(h.subscribeKey("quoteStatus",t=>this.quoteStatus=t),h.subscribeKey("quote",t=>this.quote=t),B.subscribeKey("activeConnectorIds",t=>this.activeConnectorIds=t),h.subscribeKey("selectedExchange",t=>this.selectedExchange=t))}connectedCallback(){super.connectedCallback(),this.startPolling()}disconnectedCallback(){super.disconnectedCallback(),this.stopPolling(),this.unsubscribe.forEach(t=>t())}render(){return c`
      <wui-flex flexDirection="column" .padding=${["3","0","0","0"]} gap="2">
        ${this.tokenTemplate()} ${this.paymentTemplate()} ${this.paymentLifecycleTemplate()}
      </wui-flex>
    `}tokenTemplate(){const t=Ve(this.amount||"0"),n=this.paymentAsset.metadata.symbol??"Unknown",s=g.getAllRequestedCaipNetworks().find(a=>a.caipNetworkId===this.paymentAsset.network),i=this.quoteStatus==="failure"||this.quoteStatus==="timeout"||this.quoteStatus==="refund";return this.quoteStatus==="success"||this.quoteStatus==="submitted"?c`<wui-flex alignItems="center" justifyContent="center">
        <wui-flex justifyContent="center" alignItems="center" class="token-image success">
          <wui-icon name="checkmark" color="success" size="inherit"></wui-icon>
        </wui-flex>
      </wui-flex>`:i?c`<wui-flex alignItems="center" justifyContent="center">
        <wui-flex justifyContent="center" alignItems="center" class="token-image error">
          <wui-icon name="close" color="error" size="inherit"></wui-icon>
        </wui-flex>
      </wui-flex>`:c`
      <wui-flex alignItems="center" justifyContent="center">
        <wui-flex class="token-image-container">
          <wui-pulse size="125px" rings="3" duration="4" opacity="0.5" variant="accent-primary">
            <wui-flex justifyContent="center" alignItems="center" class="token-image loading">
              <wui-icon name="paperPlaneTitle" color="accent-primary" size="inherit"></wui-icon>
            </wui-flex>
          </wui-pulse>

          <wui-flex
            justifyContent="center"
            alignItems="center"
            class="token-badge-container loading"
          >
            <wui-flex
              alignItems="center"
              justifyContent="center"
              gap="01"
              padding="1"
              class="token-badge"
            >
              <wui-image
                src=${T(q.getNetworkImage(s))}
                class="chain-image"
                size="mdl"
              ></wui-image>

              <wui-text variant="lg-regular" color="primary">${t} ${n}</wui-text>
            </wui-flex>
          </wui-flex>
        </wui-flex>
      </wui-flex>
    `}paymentTemplate(){return c`
      <wui-flex flexDirection="column" gap="2" .padding=${["0","6","0","6"]}>
        ${this.renderPayment()}
        <wui-separator></wui-separator>
        ${this.renderWallet()}
      </wui-flex>
    `}paymentLifecycleTemplate(){const t=this.getStepsWithStatus();return c`
      <wui-flex flexDirection="column" padding="4" gap="2" class="payment-lifecycle-container">
        <wui-flex alignItems="center" justifyContent="space-between">
          <wui-text variant="md-regular" color="secondary">PAYMENT CYCLE</wui-text>

          ${this.renderPaymentCycleBadge()}
        </wui-flex>

        <wui-flex flexDirection="column" gap="5" .padding=${["2","0","2","0"]}>
          ${t.map(n=>this.renderStep(n))}
        </wui-flex>
      </wui-flex>
    `}renderPaymentCycleBadge(){var s;const t=this.quoteStatus==="failure"||this.quoteStatus==="timeout"||this.quoteStatus==="refund",n=this.quoteStatus==="success"||this.quoteStatus==="submitted";if(t)return c`
        <wui-flex
          justifyContent="center"
          alignItems="center"
          class="payment-step-badge error"
          gap="1"
        >
          <wui-icon name="close" color="error" size="xs"></wui-icon>
          <wui-text variant="sm-regular" color="error">Failed</wui-text>
        </wui-flex>
      `;if(n)return c`
        <wui-flex
          justifyContent="center"
          alignItems="center"
          class="payment-step-badge success"
          gap="1"
        >
          <wui-icon name="checkmark" color="success" size="xs"></wui-icon>
          <wui-text variant="sm-regular" color="success">Completed</wui-text>
        </wui-flex>
      `;const o=((s=this.quote)==null?void 0:s.timeInSeconds)??0;return c`
      <wui-flex alignItems="center" justifyContent="space-between" gap="3">
        <wui-flex
          justifyContent="center"
          alignItems="center"
          class="payment-step-badge loading"
          gap="1"
        >
          <wui-icon name="clock" color="default" size="xs"></wui-icon>
          <wui-text variant="sm-regular" color="primary">Est. ${o} sec</wui-text>
        </wui-flex>

        <wui-icon name="chevronBottom" color="default" size="xxs"></wui-icon>
      </wui-flex>
    `}renderPayment(){var r,a,d;const n=g.getAllRequestedCaipNetworks().find(y=>{var W;const E=(W=this.quote)==null?void 0:W.origin.currency.network;if(!E)return!1;const{chainId:O}=N.parseCaipNetworkId(E);return J.isLowerCaseMatch(y.id.toString(),O.toString())}),o=x.formatNumber(((r=this.quote)==null?void 0:r.origin.amount)||"0",{decimals:((a=this.quote)==null?void 0:a.origin.currency.metadata.decimals)??0}).toString(),s=Ve(o),i=((d=this.quote)==null?void 0:d.origin.currency.metadata.symbol)??"Unknown";return c`
      <wui-flex
        alignItems="flex-start"
        justifyContent="space-between"
        .padding=${["3","0","3","0"]}
      >
        <wui-text variant="lg-regular" color="secondary">Payment Method</wui-text>

        <wui-flex flexDirection="column" alignItems="flex-end" gap="1">
          <wui-flex alignItems="center" gap="01">
            <wui-text variant="lg-regular" color="primary">${s}</wui-text>
            <wui-text variant="lg-regular" color="secondary">${i}</wui-text>
          </wui-flex>

          <wui-flex alignItems="center" gap="1">
            <wui-text variant="md-regular" color="secondary">on</wui-text>
            <wui-image
              src=${T(q.getNetworkImage(n))}
              size="xs"
            ></wui-image>
            <wui-text variant="md-regular" color="secondary">${n==null?void 0:n.name}</wui-text>
          </wui-flex>
        </wui-flex>
      </wui-flex>
    `}renderWallet(){return c`
      <wui-flex
        alignItems="flex-start"
        justifyContent="space-between"
        .padding=${["3","0","3","0"]}
      >
        <wui-text variant="lg-regular" color="secondary"
          >${this.selectedExchange?"Exchange":"Wallet"}</wui-text
        >

        ${this.renderWalletText()}
      </wui-flex>
    `}renderWalletText(){var s;const{image:t}=this.getWalletProperties({namespace:this.namespace}),{address:n}=this.caipAddress?N.parseCaipAddress(this.caipAddress):{},o=(s=this.selectedExchange)==null?void 0:s.name;return this.selectedExchange?c`
        <wui-flex alignItems="center" justifyContent="flex-end" gap="1">
          <wui-text variant="lg-regular" color="primary">${o}</wui-text>
          <wui-image src=${T(this.selectedExchange.imageUrl)} size="mdl"></wui-image>
        </wui-flex>
      `:c`
      <wui-flex alignItems="center" justifyContent="flex-end" gap="1">
        <wui-text variant="lg-regular" color="primary">
          ${Ze.getTruncateString({string:this.profileName||n||o||"",charsStart:this.profileName?16:4,charsEnd:this.profileName?0:6,truncate:this.profileName?"end":"middle"})}
        </wui-text>

        <wui-image src=${T(t)} size="mdl"></wui-image>
      </wui-flex>
    `}getStepsWithStatus(){return this.quoteStatus==="failure"||this.quoteStatus==="timeout"||this.quoteStatus==="refund"?Ot.map(n=>({...n,status:"failed"})):Ot.map(n=>{const s=(Jn[n.id]??[]).includes(this.quoteStatus)?"completed":"pending";return{...n,status:s}})}renderStep({title:t,icon:n,status:o}){return c`
      <wui-flex alignItems="center" gap="3">
        <wui-flex justifyContent="center" alignItems="center" class="step-icon-container">
          <wui-icon name=${n} color="default" size="mdl"></wui-icon>

          <wui-flex alignItems="center" justifyContent="center" class=${zt({"step-icon-box":!0,success:o==="completed"})}>
            ${this.renderStatusIndicator(o)}
          </wui-flex>
        </wui-flex>

        <wui-text variant="md-regular" color="primary">${t}</wui-text>
      </wui-flex>
    `}renderStatusIndicator(t){return t==="completed"?c`<wui-icon size="sm" color="success" name="checkmark"></wui-icon>`:t==="failed"?c`<wui-icon size="sm" color="error" name="close"></wui-icon>`:t==="pending"?c`<wui-loading-spinner color="accent-primary" size="sm"></wui-loading-spinner>`:null}startPolling(){this.pollingInterval||(this.fetchQuoteStatus(),this.pollingInterval=setInterval(()=>{this.fetchQuoteStatus()},ei))}stopPolling(){this.pollingInterval&&(clearInterval(this.pollingInterval),this.pollingInterval=null)}async fetchQuoteStatus(){const t=h.state.requestId;if(!t||Ut.includes(this.quoteStatus))this.stopPolling();else try{await h.fetchQuoteStatus({requestId:t}),Ut.includes(this.quoteStatus)&&this.stopPolling()}catch{this.stopPolling()}}initializeNamespace(){var n,o;const t=g.state.activeChain;this.namespace=t,this.caipAddress=(n=g.getAccountData(t))==null?void 0:n.caipAddress,this.profileName=((o=g.getAccountData(t))==null?void 0:o.profileName)??null,this.unsubscribe.push(g.subscribeChainProp("accountState",s=>{this.caipAddress=s==null?void 0:s.caipAddress,this.profileName=(s==null?void 0:s.profileName)??null},t))}getWalletProperties({namespace:t}){if(!t)return{name:void 0,image:void 0};const n=this.activeConnectorIds[t];if(!n)return{name:void 0,image:void 0};const o=B.getConnector({id:n,namespace:t});if(!o)return{name:void 0,image:void 0};const s=q.getConnectorImage(o);return{name:o.name,image:s}}};Y.styles=Zn;re([m()],Y.prototype,"paymentAsset",void 0);re([m()],Y.prototype,"quoteStatus",void 0);re([m()],Y.prototype,"quote",void 0);re([m()],Y.prototype,"amount",void 0);re([m()],Y.prototype,"namespace",void 0);re([m()],Y.prototype,"caipAddress",void 0);re([m()],Y.prototype,"profileName",void 0);re([m()],Y.prototype,"activeConnectorIds",void 0);re([m()],Y.prototype,"selectedExchange",void 0);Y=re([k("w3m-pay-loading-view")],Y);const ti=S`
  button {
    display: flex;
    align-items: center;
    height: 40px;
    padding: ${({spacing:e})=>e[2]};
    border-radius: ${({borderRadius:e})=>e[4]};
    column-gap: ${({spacing:e})=>e[1]};
    background-color: transparent;
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color;
  }

  wui-image,
  .icon-box {
    width: ${({spacing:e})=>e[6]};
    height: ${({spacing:e})=>e[6]};
    border-radius: ${({borderRadius:e})=>e[4]};
  }

  wui-text {
    flex: 1;
  }

  .icon-box {
    position: relative;
  }

  .icon-box[data-active='true'] {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
  }

  .circle {
    position: absolute;
    left: 16px;
    top: 15px;
    width: 8px;
    height: 8px;
    background-color: ${({tokens:e})=>e.core.textSuccess};
    box-shadow: 0 0 0 2px ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: 50%;
  }

  /* -- Hover & Active states ----------------------------------------------------------- */
  @media (hover: hover) {
    button:hover:enabled,
    button:active:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    }
  }
`;var ee=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let V=class extends A{constructor(){super(...arguments),this.address="",this.profileName="",this.alt="",this.imageSrc="",this.icon=void 0,this.iconSize="md",this.enableGreenCircle=!0,this.loading=!1,this.charsStart=4,this.charsEnd=6}render(){return c`
      <button>
        ${this.leftImageTemplate()} ${this.textTemplate()} ${this.rightImageTemplate()}
      </button>
    `}leftImageTemplate(){const t=this.icon?c`<wui-icon
          size=${T(this.iconSize)}
          color="default"
          name=${this.icon}
          class="icon"
        ></wui-icon>`:c`<wui-image src=${this.imageSrc} alt=${this.alt}></wui-image>`;return c`
      <wui-flex
        alignItems="center"
        justifyContent="center"
        class="icon-box"
        data-active=${!!this.icon}
      >
        ${t}
        ${this.enableGreenCircle?c`<wui-flex class="circle"></wui-flex>`:null}
      </wui-flex>
    `}textTemplate(){return c`
      <wui-text variant="lg-regular" color="primary">
        ${Ze.getTruncateString({string:this.profileName||this.address,charsStart:this.profileName?16:this.charsStart,charsEnd:this.profileName?0:this.charsEnd,truncate:this.profileName?"end":"middle"})}
      </wui-text>
    `}rightImageTemplate(){return c`<wui-icon name="chevronBottom" size="sm" color="default"></wui-icon>`}};V.styles=[se,Xe,ti];ee([p()],V.prototype,"address",void 0);ee([p()],V.prototype,"profileName",void 0);ee([p()],V.prototype,"alt",void 0);ee([p()],V.prototype,"imageSrc",void 0);ee([p()],V.prototype,"icon",void 0);ee([p()],V.prototype,"iconSize",void 0);ee([p({type:Boolean})],V.prototype,"enableGreenCircle",void 0);ee([p({type:Boolean})],V.prototype,"loading",void 0);ee([p({type:Number})],V.prototype,"charsStart",void 0);ee([p({type:Number})],V.prototype,"charsEnd",void 0);V=ee([k("wui-wallet-switch")],V);const ni=Ke`
  :host {
    display: block;
  }
`;var ii=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let ct=class extends A{render(){return c`
      <wui-flex flexDirection="column" gap="4">
        <wui-flex alignItems="center" justifyContent="space-between">
          <wui-text variant="md-regular" color="secondary">Pay</wui-text>
          <wui-shimmer width="60px" height="16px" borderRadius="4xs" variant="light"></wui-shimmer>
        </wui-flex>

        <wui-flex alignItems="center" justifyContent="space-between">
          <wui-text variant="md-regular" color="secondary">Network Fee</wui-text>

          <wui-flex flexDirection="column" alignItems="flex-end" gap="2">
            <wui-shimmer
              width="75px"
              height="16px"
              borderRadius="4xs"
              variant="light"
            ></wui-shimmer>

            <wui-flex alignItems="center" gap="01">
              <wui-shimmer width="14px" height="14px" rounded variant="light"></wui-shimmer>
              <wui-shimmer
                width="49px"
                height="14px"
                borderRadius="4xs"
                variant="light"
              ></wui-shimmer>
            </wui-flex>
          </wui-flex>
        </wui-flex>

        <wui-flex alignItems="center" justifyContent="space-between">
          <wui-text variant="md-regular" color="secondary">Service Fee</wui-text>
          <wui-shimmer width="75px" height="16px" borderRadius="4xs" variant="light"></wui-shimmer>
        </wui-flex>
      </wui-flex>
    `}};ct.styles=[ni];ct=ii([k("w3m-pay-fees-skeleton")],ct);const oi=S`
  :host {
    display: block;
  }

  wui-image {
    border-radius: ${({borderRadius:e})=>e.round};
  }
`;var Gt=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let He=class extends A{constructor(){super(),this.unsubscribe=[],this.quote=h.state.quote,this.unsubscribe.push(h.subscribeKey("quote",t=>this.quote=t))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){var n,o,s;const t=x.formatNumber(((n=this.quote)==null?void 0:n.origin.amount)||"0",{decimals:((o=this.quote)==null?void 0:o.origin.currency.metadata.decimals)??0,round:6}).toString();return c`
      <wui-flex flexDirection="column" gap="4">
        <wui-flex alignItems="center" justifyContent="space-between">
          <wui-text variant="md-regular" color="secondary">Pay</wui-text>
          <wui-text variant="md-regular" color="primary">
            ${t} ${((s=this.quote)==null?void 0:s.origin.currency.metadata.symbol)||"Unknown"}
          </wui-text>
        </wui-flex>

        ${this.quote&&this.quote.fees.length>0?this.quote.fees.map(i=>this.renderFee(i)):null}
      </wui-flex>
    `}renderFee(t){const n=t.id==="network",o=x.formatNumber(t.amount||"0",{decimals:t.currency.metadata.decimals??0,round:6}).toString();if(n){const i=g.getAllRequestedCaipNetworks().find(r=>J.isLowerCaseMatch(r.caipNetworkId,t.currency.network));return c`
        <wui-flex alignItems="center" justifyContent="space-between">
          <wui-text variant="md-regular" color="secondary">${t.label}</wui-text>

          <wui-flex flexDirection="column" alignItems="flex-end" gap="2">
            <wui-text variant="md-regular" color="primary">
              ${o} ${t.currency.metadata.symbol||"Unknown"}
            </wui-text>

            <wui-flex alignItems="center" gap="01">
              <wui-image
                src=${T(q.getNetworkImage(i))}
                size="xs"
              ></wui-image>
              <wui-text variant="sm-regular" color="secondary">
                ${(i==null?void 0:i.name)||"Unknown"}
              </wui-text>
            </wui-flex>
          </wui-flex>
        </wui-flex>
      `}return c`
      <wui-flex alignItems="center" justifyContent="space-between">
        <wui-text variant="md-regular" color="secondary">${t.label}</wui-text>
        <wui-text variant="md-regular" color="primary">
          ${o} ${t.currency.metadata.symbol||"Unknown"}
        </wui-text>
      </wui-flex>
    `}};He.styles=[oi];Gt([m()],He.prototype,"quote",void 0);He=Gt([k("w3m-pay-fees")],He);const si=S`
  :host {
    display: block;
    width: 100%;
  }

  .disabled-container {
    padding: ${({spacing:e})=>e[2]};
    min-height: 168px;
  }

  wui-icon {
    width: ${({spacing:e})=>e[8]};
    height: ${({spacing:e})=>e[8]};
  }

  wui-flex > wui-text {
    max-width: 273px;
  }
`;var Yt=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let Ge=class extends A{constructor(){super(),this.unsubscribe=[],this.selectedExchange=h.state.selectedExchange,this.unsubscribe.push(h.subscribeKey("selectedExchange",t=>this.selectedExchange=t))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){const t=!!this.selectedExchange;return c`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap="3"
        class="disabled-container"
      >
        <wui-icon name="coins" color="default" size="inherit"></wui-icon>

        <wui-text variant="md-regular" color="primary" align="center">
          You don't have enough funds to complete this transaction
        </wui-text>

        ${t?null:c`<wui-button
              size="md"
              variant="neutral-secondary"
              @click=${this.dispatchConnectOtherWalletEvent.bind(this)}
              >Connect other wallet</wui-button
            >`}
      </wui-flex>
    `}dispatchConnectOtherWalletEvent(){this.dispatchEvent(new CustomEvent("connectOtherWallet",{detail:!0,bubbles:!0,composed:!0}))}};Ge.styles=[si];Yt([p({type:Array})],Ge.prototype,"selectedExchange",void 0);Ge=Yt([k("w3m-pay-options-empty")],Ge);const ri=S`
  :host {
    display: block;
    width: 100%;
  }

  .pay-options-container {
    max-height: 196px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }

  .pay-options-container::-webkit-scrollbar {
    display: none;
  }

  .pay-option-container {
    border-radius: ${({borderRadius:e})=>e[4]};
    padding: ${({spacing:e})=>e[3]};
    min-height: 60px;
  }

  .token-images-container {
    position: relative;
    justify-content: center;
    align-items: center;
  }

  .chain-image {
    position: absolute;
    bottom: -3px;
    right: -5px;
    border: 2px solid ${({tokens:e})=>e.theme.foregroundSecondary};
  }
`;var ai=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let lt=class extends A{render(){return c`
      <wui-flex flexDirection="column" gap="2" class="pay-options-container">
        ${this.renderOptionEntry()} ${this.renderOptionEntry()} ${this.renderOptionEntry()}
      </wui-flex>
    `}renderOptionEntry(){return c`
      <wui-flex
        alignItems="center"
        justifyContent="space-between"
        gap="2"
        class="pay-option-container"
      >
        <wui-flex alignItems="center" gap="2">
          <wui-flex class="token-images-container">
            <wui-shimmer
              width="32px"
              height="32px"
              rounded
              variant="light"
              class="token-image"
            ></wui-shimmer>
            <wui-shimmer
              width="16px"
              height="16px"
              rounded
              variant="light"
              class="chain-image"
            ></wui-shimmer>
          </wui-flex>

          <wui-flex flexDirection="column" gap="1">
            <wui-shimmer
              width="74px"
              height="16px"
              borderRadius="4xs"
              variant="light"
            ></wui-shimmer>
            <wui-shimmer
              width="46px"
              height="14px"
              borderRadius="4xs"
              variant="light"
            ></wui-shimmer>
          </wui-flex>
        </wui-flex>
      </wui-flex>
    `}};lt.styles=[ri];lt=ai([k("w3m-pay-options-skeleton")],lt);const ci=S`
  :host {
    display: block;
    width: 100%;
  }

  .pay-options-container {
    max-height: 196px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    mask-image: var(--options-mask-image);
    -webkit-mask-image: var(--options-mask-image);
  }

  .pay-options-container::-webkit-scrollbar {
    display: none;
  }

  .pay-option-container {
    cursor: pointer;
    border-radius: ${({borderRadius:e})=>e[4]};
    padding: ${({spacing:e})=>e[3]};
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-1"]};
    will-change: background-color;
  }

  .token-images-container {
    position: relative;
    justify-content: center;
    align-items: center;
  }

  .token-image {
    border-radius: ${({borderRadius:e})=>e.round};
    width: 32px;
    height: 32px;
  }

  .chain-image {
    position: absolute;
    width: 16px;
    height: 16px;
    bottom: -3px;
    right: -5px;
    border-radius: ${({borderRadius:e})=>e.round};
    border: 2px solid ${({tokens:e})=>e.theme.backgroundPrimary};
  }

  @media (hover: hover) and (pointer: fine) {
    .pay-option-container:hover {
      background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    }
  }
`;var Je=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};const li=300;let xe=class extends A{constructor(){super(),this.unsubscribe=[],this.options=[],this.selectedPaymentAsset=null}disconnectedCallback(){var n,o;this.unsubscribe.forEach(s=>s()),(n=this.resizeObserver)==null||n.disconnect();const t=(o=this.shadowRoot)==null?void 0:o.querySelector(".pay-options-container");t==null||t.removeEventListener("scroll",this.handleOptionsListScroll.bind(this))}firstUpdated(){var n,o;const t=(n=this.shadowRoot)==null?void 0:n.querySelector(".pay-options-container");t&&(requestAnimationFrame(this.handleOptionsListScroll.bind(this)),t==null||t.addEventListener("scroll",this.handleOptionsListScroll.bind(this)),this.resizeObserver=new ResizeObserver(()=>{this.handleOptionsListScroll()}),(o=this.resizeObserver)==null||o.observe(t),this.handleOptionsListScroll())}render(){return c`
      <wui-flex flexDirection="column" gap="2" class="pay-options-container">
        ${this.options.map(t=>this.payOptionTemplate(t))}
      </wui-flex>
    `}payOptionTemplate(t){var K,X;const{network:n,metadata:o,asset:s,amount:i="0"}=t,a=g.getAllRequestedCaipNetworks().find(j=>j.caipNetworkId===n),d=`${n}:${s}`,y=`${(K=this.selectedPaymentAsset)==null?void 0:K.network}:${(X=this.selectedPaymentAsset)==null?void 0:X.asset}`,E=d===y,O=x.bigNumber(i,{safe:!0}),W=O.gt(0);return c`
      <wui-flex
        alignItems="center"
        justifyContent="space-between"
        gap="2"
        @click=${()=>{var j;return(j=this.onSelect)==null?void 0:j.call(this,t)}}
        class="pay-option-container"
      >
        <wui-flex alignItems="center" gap="2">
          <wui-flex class="token-images-container">
            <wui-image
              src=${T(o.logoURI)}
              class="token-image"
              size="3xl"
            ></wui-image>
            <wui-image
              src=${T(q.getNetworkImage(a))}
              class="chain-image"
              size="md"
            ></wui-image>
          </wui-flex>

          <wui-flex flexDirection="column" gap="1">
            <wui-text variant="lg-regular" color="primary">${o.symbol}</wui-text>
            ${W?c`<wui-text variant="sm-regular" color="secondary">
                  ${O.round(6).toString()} ${o.symbol}
                </wui-text>`:null}
          </wui-flex>
        </wui-flex>

        ${E?c`<wui-icon name="checkmark" size="md" color="success"></wui-icon>`:null}
      </wui-flex>
    `}handleOptionsListScroll(){var o;const t=(o=this.shadowRoot)==null?void 0:o.querySelector(".pay-options-container");if(!t)return;t.scrollHeight>li?(t.style.setProperty("--options-mask-image",`linear-gradient(
          to bottom,
          rgba(0, 0, 0, calc(1 - var(--options-scroll--top-opacity))) 0px,
          rgba(200, 200, 200, calc(1 - var(--options-scroll--top-opacity))) 1px,
          black 50px,
          black calc(100% - 50px),
          rgba(155, 155, 155, calc(1 - var(--options-scroll--bottom-opacity))) calc(100% - 1px),
          rgba(0, 0, 0, calc(1 - var(--options-scroll--bottom-opacity))) 100%
        )`),t.style.setProperty("--options-scroll--top-opacity",Ct.interpolate([0,50],[0,1],t.scrollTop).toString()),t.style.setProperty("--options-scroll--bottom-opacity",Ct.interpolate([0,50],[0,1],t.scrollHeight-t.scrollTop-t.offsetHeight).toString())):(t.style.setProperty("--options-mask-image","none"),t.style.setProperty("--options-scroll--top-opacity","0"),t.style.setProperty("--options-scroll--bottom-opacity","0"))}};xe.styles=[ci];Je([p({type:Array})],xe.prototype,"options",void 0);Je([p()],xe.prototype,"selectedPaymentAsset",void 0);Je([p()],xe.prototype,"onSelect",void 0);xe=Je([k("w3m-pay-options")],xe);const ui=S`
  .payment-methods-container {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-top-right-radius: ${({borderRadius:e})=>e[5]};
    border-top-left-radius: ${({borderRadius:e})=>e[5]};
  }

  .pay-options-container {
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    border-radius: ${({borderRadius:e})=>e[5]};
    padding: ${({spacing:e})=>e[1]};
  }

  w3m-tooltip-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    max-width: fit-content;
  }

  wui-image {
    border-radius: ${({borderRadius:e})=>e.round};
  }

  w3m-pay-options.disabled {
    opacity: 0.5;
    pointer-events: none;
  }
`;var R=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};const Fe={eip155:"ethereum",solana:"solana",bip122:"bitcoin",ton:"ton"},di={eip155:{icon:Fe.eip155,label:"EVM"},solana:{icon:Fe.solana,label:"Solana"},bip122:{icon:Fe.bip122,label:"Bitcoin"},ton:{icon:Fe.ton,label:"Ton"}};let $=class extends A{constructor(){super(),this.unsubscribe=[],this.profileName=null,this.paymentAsset=h.state.paymentAsset,this.namespace=void 0,this.caipAddress=void 0,this.amount=h.state.amount,this.recipient=h.state.recipient,this.activeConnectorIds=B.state.activeConnectorIds,this.selectedPaymentAsset=h.state.selectedPaymentAsset,this.selectedExchange=h.state.selectedExchange,this.isFetchingQuote=h.state.isFetchingQuote,this.quoteError=h.state.quoteError,this.quote=h.state.quote,this.isFetchingTokenBalances=h.state.isFetchingTokenBalances,this.tokenBalances=h.state.tokenBalances,this.isPaymentInProgress=h.state.isPaymentInProgress,this.exchangeUrlForQuote=h.state.exchangeUrlForQuote,this.completedTransactionsCount=0,this.unsubscribe.push(h.subscribeKey("paymentAsset",t=>this.paymentAsset=t)),this.unsubscribe.push(h.subscribeKey("tokenBalances",t=>this.onTokenBalancesChanged(t))),this.unsubscribe.push(h.subscribeKey("isFetchingTokenBalances",t=>this.isFetchingTokenBalances=t)),this.unsubscribe.push(B.subscribeKey("activeConnectorIds",t=>this.activeConnectorIds=t)),this.unsubscribe.push(h.subscribeKey("selectedPaymentAsset",t=>this.selectedPaymentAsset=t)),this.unsubscribe.push(h.subscribeKey("isFetchingQuote",t=>this.isFetchingQuote=t)),this.unsubscribe.push(h.subscribeKey("quoteError",t=>this.quoteError=t)),this.unsubscribe.push(h.subscribeKey("quote",t=>this.quote=t)),this.unsubscribe.push(h.subscribeKey("amount",t=>this.amount=t)),this.unsubscribe.push(h.subscribeKey("recipient",t=>this.recipient=t)),this.unsubscribe.push(h.subscribeKey("isPaymentInProgress",t=>this.isPaymentInProgress=t)),this.unsubscribe.push(h.subscribeKey("selectedExchange",t=>this.selectedExchange=t)),this.unsubscribe.push(h.subscribeKey("exchangeUrlForQuote",t=>this.exchangeUrlForQuote=t)),this.resetQuoteState(),this.initializeNamespace(),this.fetchTokens()}disconnectedCallback(){super.disconnectedCallback(),this.resetAssetsState(),this.unsubscribe.forEach(t=>t())}updated(t){super.updated(t),t.has("selectedPaymentAsset")&&this.fetchQuote()}render(){return c`
      <wui-flex flexDirection="column">
        ${this.profileTemplate()}

        <wui-flex
          flexDirection="column"
          gap="4"
          class="payment-methods-container"
          .padding=${["4","4","5","4"]}
        >
          ${this.paymentOptionsViewTemplate()} ${this.amountWithFeeTemplate()}

          <wui-flex
            alignItems="center"
            justifyContent="space-between"
            .padding=${["1","0","1","0"]}
          >
            <wui-separator></wui-separator>
          </wui-flex>

          ${this.paymentActionsTemplate()}
        </wui-flex>
      </wui-flex>
    `}profileTemplate(){var r,a;if(this.selectedExchange){const d=x.formatNumber((r=this.quote)==null?void 0:r.origin.amount,{decimals:((a=this.quote)==null?void 0:a.origin.currency.metadata.decimals)??0}).toString();return c`
        <wui-flex
          .padding=${["4","3","4","3"]}
          alignItems="center"
          justifyContent="space-between"
          gap="2"
        >
          <wui-text variant="lg-regular" color="secondary">Paying with</wui-text>

          ${this.quote?c`<wui-text variant="lg-regular" color="primary">
                ${x.bigNumber(d,{safe:!0}).round(6).toString()}
                ${this.quote.origin.currency.metadata.symbol}
              </wui-text>`:c`<wui-shimmer width="80px" height="18px" variant="light"></wui-shimmer>`}
        </wui-flex>
      `}const t=G.getPlainAddress(this.caipAddress)??"",{name:n,image:o}=this.getWalletProperties({namespace:this.namespace}),{icon:s,label:i}=di[this.namespace]??{};return c`
      <wui-flex
        .padding=${["4","3","4","3"]}
        alignItems="center"
        justifyContent="space-between"
        gap="2"
      >
        <wui-wallet-switch
          profileName=${T(this.profileName)}
          address=${T(t)}
          imageSrc=${T(o)}
          alt=${T(n)}
          @click=${this.onConnectOtherWallet.bind(this)}
          data-testid="wui-wallet-switch"
        ></wui-wallet-switch>

        <wui-wallet-switch
          profileName=${T(i)}
          address=${T(t)}
          icon=${T(s)}
          iconSize="xs"
          .enableGreenCircle=${!1}
          alt=${T(i)}
          @click=${this.onConnectOtherWallet.bind(this)}
          data-testid="wui-wallet-switch"
        ></wui-wallet-switch>
      </wui-flex>
    `}initializeNamespace(){var n,o;const t=g.state.activeChain;this.namespace=t,this.caipAddress=(n=g.getAccountData(t))==null?void 0:n.caipAddress,this.profileName=((o=g.getAccountData(t))==null?void 0:o.profileName)??null,this.unsubscribe.push(g.subscribeChainProp("accountState",s=>this.onAccountStateChanged(s),t))}async fetchTokens(){if(this.namespace){let t;if(this.caipAddress){const{chainId:n,chainNamespace:o}=N.parseCaipAddress(this.caipAddress),s=`${o}:${n}`;t=g.getAllRequestedCaipNetworks().find(r=>r.caipNetworkId===s)}await h.fetchTokens({caipAddress:this.caipAddress,caipNetwork:t,namespace:this.namespace})}}fetchQuote(){if(this.amount&&this.recipient&&this.selectedPaymentAsset&&this.paymentAsset){const{address:t}=this.caipAddress?N.parseCaipAddress(this.caipAddress):{};h.fetchQuote({amount:this.amount.toString(),address:t,sourceToken:this.selectedPaymentAsset,toToken:this.paymentAsset,recipient:this.recipient})}}getWalletProperties({namespace:t}){if(!t)return{name:void 0,image:void 0};const n=this.activeConnectorIds[t];if(!n)return{name:void 0,image:void 0};const o=B.getConnector({id:n,namespace:t});if(!o)return{name:void 0,image:void 0};const s=q.getConnectorImage(o);return{name:o.name,image:s}}paymentOptionsViewTemplate(){return c`
      <wui-flex flexDirection="column" gap="2">
        <wui-text variant="sm-regular" color="secondary">CHOOSE PAYMENT OPTION</wui-text>
        <wui-flex class="pay-options-container">${this.paymentOptionsTemplate()}</wui-flex>
      </wui-flex>
    `}paymentOptionsTemplate(){const t=this.getPaymentAssetFromTokenBalances();if(this.isFetchingTokenBalances)return c`<w3m-pay-options-skeleton></w3m-pay-options-skeleton>`;if(t.length===0)return c`<w3m-pay-options-empty
        @connectOtherWallet=${this.onConnectOtherWallet.bind(this)}
      ></w3m-pay-options-empty>`;const n={disabled:this.isFetchingQuote};return c`<w3m-pay-options
      class=${zt(n)}
      .options=${t}
      .selectedPaymentAsset=${T(this.selectedPaymentAsset)}
      .onSelect=${this.onSelectedPaymentAssetChanged.bind(this)}
    ></w3m-pay-options>`}amountWithFeeTemplate(){return this.isFetchingQuote||!this.selectedPaymentAsset||this.quoteError?c`<w3m-pay-fees-skeleton></w3m-pay-fees-skeleton>`:c`<w3m-pay-fees></w3m-pay-fees>`}paymentActionsTemplate(){var s,i,r;const t=this.isFetchingQuote||this.isFetchingTokenBalances,n=this.isFetchingQuote||this.isFetchingTokenBalances||!this.selectedPaymentAsset||!!this.quoteError,o=x.formatNumber(((s=this.quote)==null?void 0:s.origin.amount)??0,{decimals:((i=this.quote)==null?void 0:i.origin.currency.metadata.decimals)??0}).toString();return this.selectedExchange?t||n?c`
          <wui-shimmer width="100%" height="48px" variant="light" ?rounded=${!0}></wui-shimmer>
        `:c`<wui-button
        size="lg"
        fullWidth
        variant="accent-secondary"
        @click=${this.onPayWithExchange.bind(this)}
      >
        ${`Continue in ${this.selectedExchange.name}`}

        <wui-icon name="arrowRight" color="inherit" size="sm" slot="iconRight"></wui-icon>
      </wui-button>`:c`
      <wui-flex alignItems="center" justifyContent="space-between">
        <wui-flex flexDirection="column" gap="1">
          <wui-text variant="md-regular" color="secondary">Order Total</wui-text>

          ${t||n?c`<wui-shimmer width="58px" height="32px" variant="light"></wui-shimmer>`:c`<wui-flex alignItems="center" gap="01">
                <wui-text variant="h4-regular" color="primary">${Ve(o)}</wui-text>

                <wui-text variant="lg-regular" color="secondary">
                  ${((r=this.quote)==null?void 0:r.origin.currency.metadata.symbol)||"Unknown"}
                </wui-text>
              </wui-flex>`}
        </wui-flex>

        ${this.actionButtonTemplate({isLoading:t,isDisabled:n})}
      </wui-flex>
    `}actionButtonTemplate(t){const n=tt(this.quote),{isLoading:o,isDisabled:s}=t;let i="Pay";return n.length>1&&this.completedTransactionsCount===0&&(i="Approve"),c`
      <wui-button
        size="lg"
        variant="accent-primary"
        ?loading=${o||this.isPaymentInProgress}
        ?disabled=${s||this.isPaymentInProgress}
        @click=${()=>{n.length>0?this.onSendTransactions():this.onTransfer()}}
      >
        ${i}
        ${o?null:c`<wui-icon
              name="arrowRight"
              color="inherit"
              size="sm"
              slot="iconRight"
            ></wui-icon>`}
      </wui-button>
    `}getPaymentAssetFromTokenBalances(){return this.namespace?(this.tokenBalances[this.namespace]??[]).map(s=>{try{return Fn(s)}catch{return null}}).filter(s=>!!s).filter(s=>{const{chainId:i}=N.parseCaipNetworkId(s.network),{chainId:r}=N.parseCaipNetworkId(this.paymentAsset.network);return J.isLowerCaseMatch(s.asset,this.paymentAsset.asset)?!0:this.selectedExchange?!J.isLowerCaseMatch(i.toString(),r.toString()):!0}):[]}onTokenBalancesChanged(t){this.tokenBalances=t;const[n]=this.getPaymentAssetFromTokenBalances();n&&h.setSelectedPaymentAsset(n)}async onConnectOtherWallet(){await B.connect(),await L.open({view:"PayQuote"})}onAccountStateChanged(t){const{address:n}=this.caipAddress?N.parseCaipAddress(this.caipAddress):{};if(this.caipAddress=t==null?void 0:t.caipAddress,this.profileName=(t==null?void 0:t.profileName)??null,n){const{address:o}=this.caipAddress?N.parseCaipAddress(this.caipAddress):{};o?J.isLowerCaseMatch(o,n)||(this.resetAssetsState(),this.resetQuoteState(),this.fetchTokens()):L.close()}}onSelectedPaymentAssetChanged(t){this.isFetchingQuote||h.setSelectedPaymentAsset(t)}async onTransfer(){var n,o,s;const t=rt(this.quote);if(t){if(!J.isLowerCaseMatch((n=this.selectedPaymentAsset)==null?void 0:n.asset,t.deposit.currency))throw new Error("Quote asset is not the same as the selected payment asset");const r=((o=this.selectedPaymentAsset)==null?void 0:o.amount)??"0",a=x.formatNumber(t.deposit.amount,{decimals:((s=this.selectedPaymentAsset)==null?void 0:s.metadata.decimals)??0}).toString();if(!x.bigNumber(r).gte(a)){I.showError("Insufficient funds");return}if(this.quote&&this.selectedPaymentAsset&&this.caipAddress&&this.namespace){const{address:y}=N.parseCaipAddress(this.caipAddress);await h.onTransfer({chainNamespace:this.namespace,fromAddress:y,toAddress:t.deposit.receiver,amount:a,paymentAsset:this.selectedPaymentAsset}),h.setRequestId(t.requestId),w.push("PayLoading")}}}async onSendTransactions(){var r,a,d;const t=((r=this.selectedPaymentAsset)==null?void 0:r.amount)??"0",n=x.formatNumber(((a=this.quote)==null?void 0:a.origin.amount)??0,{decimals:((d=this.selectedPaymentAsset)==null?void 0:d.metadata.decimals)??0}).toString();if(!x.bigNumber(t).gte(n)){I.showError("Insufficient funds");return}const s=tt(this.quote),[i]=tt(this.quote,this.completedTransactionsCount);i&&this.namespace&&(await h.onSendTransaction({namespace:this.namespace,transactionStep:i}),this.completedTransactionsCount+=1,this.completedTransactionsCount===s.length&&(h.setRequestId(i.requestId),w.push("PayLoading")))}onPayWithExchange(){if(this.exchangeUrlForQuote){const t=G.returnOpenHref("","popupWindow","scrollbar=yes,width=480,height=720");if(!t)throw new Error("Could not create popup window");t.location.href=this.exchangeUrlForQuote;const n=rt(this.quote);n&&h.setRequestId(n.requestId),h.initiatePayment(),w.push("PayLoading")}}resetAssetsState(){h.setSelectedPaymentAsset(null)}resetQuoteState(){h.resetQuoteState()}};$.styles=ui;R([m()],$.prototype,"profileName",void 0);R([m()],$.prototype,"paymentAsset",void 0);R([m()],$.prototype,"namespace",void 0);R([m()],$.prototype,"caipAddress",void 0);R([m()],$.prototype,"amount",void 0);R([m()],$.prototype,"recipient",void 0);R([m()],$.prototype,"activeConnectorIds",void 0);R([m()],$.prototype,"selectedPaymentAsset",void 0);R([m()],$.prototype,"selectedExchange",void 0);R([m()],$.prototype,"isFetchingQuote",void 0);R([m()],$.prototype,"quoteError",void 0);R([m()],$.prototype,"quote",void 0);R([m()],$.prototype,"isFetchingTokenBalances",void 0);R([m()],$.prototype,"tokenBalances",void 0);R([m()],$.prototype,"isPaymentInProgress",void 0);R([m()],$.prototype,"exchangeUrlForQuote",void 0);R([m()],$.prototype,"completedTransactionsCount",void 0);$=R([k("w3m-pay-quote-view")],$);const pi=S`
  wui-image {
    border-radius: ${({borderRadius:e})=>e.round};
  }

  .transfers-badge {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border: 1px solid ${({tokens:e})=>e.theme.foregroundSecondary};
    border-radius: ${({borderRadius:e})=>e[4]};
  }
`;var vt=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let Re=class extends A{constructor(){super(),this.unsubscribe=[],this.paymentAsset=h.state.paymentAsset,this.amount=h.state.amount,this.unsubscribe.push(h.subscribeKey("paymentAsset",t=>{this.paymentAsset=t}),h.subscribeKey("amount",t=>{this.amount=t}))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){const n=g.getAllRequestedCaipNetworks().find(o=>o.caipNetworkId===this.paymentAsset.network);return c`<wui-flex
      alignItems="center"
      gap="1"
      .padding=${["1","2","1","1"]}
      class="transfers-badge"
    >
      <wui-image src=${T(this.paymentAsset.metadata.logoURI)} size="xl"></wui-image>
      <wui-text variant="lg-regular" color="primary">
        ${this.amount} ${this.paymentAsset.metadata.symbol}
      </wui-text>
      <wui-text variant="sm-regular" color="secondary">
        on ${(n==null?void 0:n.name)??"Unknown"}
      </wui-text>
    </wui-flex>`}};Re.styles=[pi];vt([p()],Re.prototype,"paymentAsset",void 0);vt([p()],Re.prototype,"amount",void 0);Re=vt([k("w3m-pay-header")],Re);const hi=S`
  :host {
    height: 60px;
  }

  :host > wui-flex {
    box-sizing: border-box;
    background-color: var(--local-header-background-color);
  }

  wui-text {
    background-color: var(--local-header-background-color);
  }

  wui-flex.w3m-header-title {
    transform: translateY(0);
    opacity: 1;
  }

  wui-flex.w3m-header-title[view-direction='prev'] {
    animation:
      slide-down-out 120ms forwards ${({easings:e})=>e["ease-out-power-2"]},
      slide-down-in 120ms forwards ${({easings:e})=>e["ease-out-power-2"]};
    animation-delay: 0ms, 200ms;
  }

  wui-flex.w3m-header-title[view-direction='next'] {
    animation:
      slide-up-out 120ms forwards ${({easings:e})=>e["ease-out-power-2"]},
      slide-up-in 120ms forwards ${({easings:e})=>e["ease-out-power-2"]};
    animation-delay: 0ms, 200ms;
  }

  wui-icon-button[data-hidden='true'] {
    opacity: 0 !important;
    pointer-events: none;
  }

  @keyframes slide-up-out {
    from {
      transform: translateY(0px);
      opacity: 1;
    }
    to {
      transform: translateY(3px);
      opacity: 0;
    }
  }

  @keyframes slide-up-in {
    from {
      transform: translateY(-3px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes slide-down-out {
    from {
      transform: translateY(0px);
      opacity: 1;
    }
    to {
      transform: translateY(-3px);
      opacity: 0;
    }
  }

  @keyframes slide-down-in {
    from {
      transform: translateY(3px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
`;var ge=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};const mi=["SmartSessionList"],wi={PayWithExchange:$e.tokens.theme.foregroundPrimary};function Wt(){var d,y,E,O,W,K,X,j;const e=(y=(d=w.state.data)==null?void 0:d.connector)==null?void 0:y.name,t=(O=(E=w.state.data)==null?void 0:E.wallet)==null?void 0:O.name,n=(K=(W=w.state.data)==null?void 0:W.network)==null?void 0:K.name,o=t??e,s=B.getConnectors(),i=s.length===1&&((X=s[0])==null?void 0:X.id)==="w3m-email",r=(j=g.getAccountData())==null?void 0:j.socialProvider,a=r?r.charAt(0).toUpperCase()+r.slice(1):"Connect Social";return{Connect:`Connect ${i?"Email":""} Wallet`,Create:"Create Wallet",ChooseAccountName:void 0,Account:void 0,AccountSettings:void 0,AllWallets:"All Wallets",ApproveTransaction:"Approve Transaction",BuyInProgress:"Buy",UsageExceeded:"Usage Exceeded",ConnectingExternal:o??"Connect Wallet",ConnectingWalletConnect:o??"WalletConnect",ConnectingWalletConnectBasic:"WalletConnect",ConnectingSiwe:"Sign In",Convert:"Convert",ConvertSelectToken:"Select token",ConvertPreview:"Preview Convert",Downloads:o?`Get ${o}`:"Downloads",EmailLogin:"Email Login",EmailVerifyOtp:"Confirm Email",EmailVerifyDevice:"Register Device",GetWallet:"Get a Wallet",Networks:"Choose Network",OnRampProviders:"Choose Provider",OnRampActivity:"Activity",OnRampTokenSelect:"Select Token",OnRampFiatSelect:"Select Currency",Pay:"How you pay",ProfileWallets:"Wallets",SwitchNetwork:n??"Switch Network",Transactions:"Activity",UnsupportedChain:"Switch Network",UpgradeEmailWallet:"Upgrade Your Wallet",UpdateEmailWallet:"Edit Email",UpdateEmailPrimaryOtp:"Confirm Current Email",UpdateEmailSecondaryOtp:"Confirm New Email",WhatIsABuy:"What is Buy?",RegisterAccountName:"Choose Name",RegisterAccountNameSuccess:"",WalletReceive:"Receive",WalletCompatibleNetworks:"Compatible Networks",Swap:"Swap",SwapSelectToken:"Select Token",SwapPreview:"Preview Swap",WalletSend:"Send",WalletSendPreview:"Review Send",WalletSendSelectToken:"Select Token",WalletSendConfirmed:"Confirmed",WhatIsANetwork:"What is a network?",WhatIsAWallet:"What is a Wallet?",ConnectWallets:"Connect Wallet",ConnectSocials:"All Socials",ConnectingSocial:a,ConnectingMultiChain:"Select Chain",ConnectingFarcaster:"Farcaster",SwitchActiveChain:"Switch Chain",SmartSessionCreated:void 0,SmartSessionList:"Smart Sessions",SIWXSignMessage:"Sign In",PayLoading:"Processing payment...",PayQuote:"Payment Quote",DataCapture:"Profile",DataCaptureOtpConfirm:"Confirm Email",FundWallet:"Fund Wallet",PayWithExchange:"Deposit from Exchange",PayWithExchangeSelectAsset:"Select Asset",SmartAccountSettings:"Smart Account Settings"}}let oe=class extends A{constructor(){super(),this.unsubscribe=[],this.heading=Wt()[w.state.view],this.network=g.state.activeCaipNetwork,this.networkImage=q.getNetworkImage(this.network),this.showBack=!1,this.prevHistoryLength=1,this.view=w.state.view,this.viewDirection="",this.unsubscribe.push(tn.subscribeNetworkImages(()=>{this.networkImage=q.getNetworkImage(this.network)}),w.subscribeKey("view",t=>{setTimeout(()=>{this.view=t,this.heading=Wt()[t]},ye.ANIMATION_DURATIONS.HeaderText),this.onViewChange(),this.onHistoryChange()}),g.subscribeKey("activeCaipNetwork",t=>{this.network=t,this.networkImage=q.getNetworkImage(this.network)}))}disconnectCallback(){this.unsubscribe.forEach(t=>t())}render(){const t=wi[w.state.view]??$e.tokens.theme.backgroundPrimary;return this.style.setProperty("--local-header-background-color",t),c`
      <wui-flex
        .padding=${["0","4","0","4"]}
        justifyContent="space-between"
        alignItems="center"
      >
        ${this.leftHeaderTemplate()} ${this.titleTemplate()} ${this.rightHeaderTemplate()}
      </wui-flex>
    `}onWalletHelp(){M.sendEvent({type:"track",event:"CLICK_WALLET_HELP"}),w.push("WhatIsAWallet")}async onClose(){await Vt.safeClose()}rightHeaderTemplate(){var n,o,s;const t=(s=(o=(n=C)==null?void 0:n.state)==null?void 0:o.features)==null?void 0:s.smartSessions;return w.state.view!=="Account"||!t?this.closeButtonTemplate():c`<wui-flex>
      <wui-icon-button
        icon="clock"
        size="lg"
        iconSize="lg"
        type="neutral"
        variant="primary"
        @click=${()=>w.push("SmartSessionList")}
        data-testid="w3m-header-smart-sessions"
      ></wui-icon-button>
      ${this.closeButtonTemplate()}
    </wui-flex> `}closeButtonTemplate(){return c`
      <wui-icon-button
        icon="close"
        size="lg"
        type="neutral"
        variant="primary"
        iconSize="lg"
        @click=${this.onClose.bind(this)}
        data-testid="w3m-header-close"
      ></wui-icon-button>
    `}titleTemplate(){if(this.view==="PayQuote")return c`<w3m-pay-header></w3m-pay-header>`;const t=mi.includes(this.view);return c`
      <wui-flex
        view-direction="${this.viewDirection}"
        class="w3m-header-title"
        alignItems="center"
        gap="2"
      >
        <wui-text
          display="inline"
          variant="lg-regular"
          color="primary"
          data-testid="w3m-header-text"
        >
          ${this.heading}
        </wui-text>
        ${t?c`<wui-tag variant="accent" size="md">Beta</wui-tag>`:null}
      </wui-flex>
    `}leftHeaderTemplate(){var y;const{view:t}=w.state,n=t==="Connect",o=C.state.enableEmbedded,s=t==="ApproveTransaction",i=t==="ConnectingSiwe",r=t==="Account",a=C.state.enableNetworkSwitch,d=s||i||n&&o;return r&&a?c`<wui-select
        id="dynamic"
        data-testid="w3m-account-select-network"
        active-network=${T((y=this.network)==null?void 0:y.name)}
        @click=${this.onNetworks.bind(this)}
        imageSrc=${T(this.networkImage)}
      ></wui-select>`:this.showBack&&!d?c`<wui-icon-button
        data-testid="header-back"
        id="dynamic"
        icon="chevronLeft"
        size="lg"
        iconSize="lg"
        type="neutral"
        variant="primary"
        @click=${this.onGoBack.bind(this)}
      ></wui-icon-button>`:c`<wui-icon-button
      data-hidden=${!n}
      id="dynamic"
      icon="helpCircle"
      size="lg"
      iconSize="lg"
      type="neutral"
      variant="primary"
      @click=${this.onWalletHelp.bind(this)}
    ></wui-icon-button>`}onNetworks(){this.isAllowedNetworkSwitch()&&(M.sendEvent({type:"track",event:"CLICK_NETWORKS"}),w.push("Networks"))}isAllowedNetworkSwitch(){const t=g.getAllRequestedCaipNetworks(),n=t?t.length>1:!1,o=t==null?void 0:t.find(({id:s})=>{var i;return s===((i=this.network)==null?void 0:i.id)});return n||!o}onViewChange(){const{history:t}=w.state;let n=ye.VIEW_DIRECTION.Next;t.length<this.prevHistoryLength&&(n=ye.VIEW_DIRECTION.Prev),this.prevHistoryLength=t.length,this.viewDirection=n}async onHistoryChange(){var o;const{history:t}=w.state,n=(o=this.shadowRoot)==null?void 0:o.querySelector("#dynamic");t.length>1&&!this.showBack&&n?(await n.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.showBack=!0,n.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"})):t.length<=1&&this.showBack&&n&&(await n.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.showBack=!1,n.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}onGoBack(){w.goBack()}};oe.styles=hi;ge([m()],oe.prototype,"heading",void 0);ge([m()],oe.prototype,"network",void 0);ge([m()],oe.prototype,"networkImage",void 0);ge([m()],oe.prototype,"showBack",void 0);ge([m()],oe.prototype,"prevHistoryLength",void 0);ge([m()],oe.prototype,"view",void 0);ge([m()],oe.prototype,"viewDirection",void 0);oe=ge([k("w3m-header")],oe);const fi=S`
  :host {
    display: flex;
    align-items: center;
    gap: ${({spacing:e})=>e[1]};
    padding: ${({spacing:e})=>e[2]} ${({spacing:e})=>e[3]}
      ${({spacing:e})=>e[2]} ${({spacing:e})=>e[2]};
    border-radius: ${({borderRadius:e})=>e[20]};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    box-shadow:
      0px 0px 8px 0px rgba(0, 0, 0, 0.1),
      inset 0 0 0 1px ${({tokens:e})=>e.theme.borderPrimary};
    max-width: 320px;
  }

  wui-icon-box {
    border-radius: ${({borderRadius:e})=>e.round} !important;
    overflow: hidden;
  }

  wui-loading-spinner {
    padding: ${({spacing:e})=>e[1]};
    background-color: ${({tokens:e})=>e.core.foregroundAccent010};
    border-radius: ${({borderRadius:e})=>e.round} !important;
  }
`;var xt=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let Oe=class extends A{constructor(){super(...arguments),this.message="",this.variant="success"}render(){return c`
      ${this.templateIcon()}
      <wui-text variant="lg-regular" color="primary" data-testid="wui-snackbar-message"
        >${this.message}</wui-text
      >
    `}templateIcon(){const t={success:"success",error:"error",warning:"warning",info:"default"},n={success:"checkmark",error:"warning",warning:"warningCircle",info:"info"};return this.variant==="loading"?c`<wui-loading-spinner size="md" color="accent-primary"></wui-loading-spinner>`:c`<wui-icon-box
      size="md"
      color=${t[this.variant]}
      icon=${n[this.variant]}
    ></wui-icon-box>`}};Oe.styles=[se,fi];xt([p()],Oe.prototype,"message",void 0);xt([p()],Oe.prototype,"variant",void 0);Oe=xt([k("wui-snackbar")],Oe);const gi=Ke`
  :host {
    display: block;
    position: absolute;
    opacity: 0;
    pointer-events: none;
    top: 11px;
    left: 50%;
    width: max-content;
  }
`;var Qt=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let Ye=class extends A{constructor(){super(),this.unsubscribe=[],this.timeout=void 0,this.open=I.state.open,this.unsubscribe.push(I.subscribeKey("open",t=>{this.open=t,this.onOpen()}))}disconnectedCallback(){clearTimeout(this.timeout),this.unsubscribe.forEach(t=>t())}render(){const{message:t,variant:n}=I.state;return c` <wui-snackbar message=${t} variant=${n}></wui-snackbar> `}onOpen(){clearTimeout(this.timeout),this.open?(this.animate([{opacity:0,transform:"translateX(-50%) scale(0.85)"},{opacity:1,transform:"translateX(-50%) scale(1)"}],{duration:150,fill:"forwards",easing:"ease"}),this.timeout&&clearTimeout(this.timeout),I.state.autoClose&&(this.timeout=setTimeout(()=>I.hide(),2500))):this.animate([{opacity:1,transform:"translateX(-50%) scale(1)"},{opacity:0,transform:"translateX(-50%) scale(0.85)"}],{duration:150,fill:"forwards",easing:"ease"})}};Ye.styles=gi;Qt([m()],Ye.prototype,"open",void 0);Ye=Qt([k("w3m-snackbar")],Ye);const yi=Ke`
  :host {
    width: 100%;
    display: block;
  }
`;var kt=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let Ue=class extends A{constructor(){super(),this.unsubscribe=[],this.text="",this.open=H.state.open,this.unsubscribe.push(w.subscribeKey("view",()=>{H.hide()}),L.subscribeKey("open",t=>{t||H.hide()}),H.subscribeKey("open",t=>{this.open=t}))}disconnectedCallback(){this.unsubscribe.forEach(t=>t()),H.hide()}render(){return c`
      <div
        @pointermove=${this.onMouseEnter.bind(this)}
        @pointerleave=${this.onMouseLeave.bind(this)}
      >
        ${this.renderChildren()}
      </div>
    `}renderChildren(){return c`<slot></slot> `}onMouseEnter(){const t=this.getBoundingClientRect();if(!this.open){const n=document.querySelector("w3m-modal"),o={width:t.width,height:t.height,left:t.left,top:t.top};if(n){const s=n.getBoundingClientRect();o.left=t.left-(window.innerWidth-s.width)/2,o.top=t.top-(window.innerHeight-s.height)/2}H.showTooltip({message:this.text,triggerRect:o,variant:"shade"})}}onMouseLeave(t){this.contains(t.relatedTarget)||H.hide()}};Ue.styles=[yi];kt([p()],Ue.prototype,"text",void 0);kt([m()],Ue.prototype,"open",void 0);Ue=kt([k("w3m-tooltip-trigger")],Ue);const bi=S`
  :host {
    pointer-events: none;
  }

  :host > wui-flex {
    display: var(--w3m-tooltip-display);
    opacity: var(--w3m-tooltip-opacity);
    padding: 9px ${({spacing:e})=>e[3]} 10px ${({spacing:e})=>e[3]};
    border-radius: ${({borderRadius:e})=>e[3]};
    color: ${({tokens:e})=>e.theme.backgroundPrimary};
    position: absolute;
    top: var(--w3m-tooltip-top);
    left: var(--w3m-tooltip-left);
    transform: translate(calc(-50% + var(--w3m-tooltip-parent-width)), calc(-100% - 8px));
    max-width: calc(var(--apkt-modal-width) - ${({spacing:e})=>e[5]});
    transition: opacity ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    will-change: opacity;
    opacity: 0;
    animation-duration: ${({durations:e})=>e.xl};
    animation-timing-function: ${({easings:e})=>e["ease-out-power-2"]};
    animation-name: fade-in;
    animation-fill-mode: forwards;
  }

  :host([data-variant='shade']) > wui-flex {
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  :host([data-variant='shade']) > wui-flex > wui-text {
    color: ${({tokens:e})=>e.theme.textSecondary};
  }

  :host([data-variant='fill']) > wui-flex {
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    border: 1px solid ${({tokens:e})=>e.theme.borderPrimary};
  }

  wui-icon {
    position: absolute;
    width: 12px !important;
    height: 4px !important;
    color: ${({tokens:e})=>e.theme.foregroundPrimary};
  }

  wui-icon[data-placement='top'] {
    bottom: 0px;
    left: 50%;
    transform: translate(-50%, 95%);
  }

  wui-icon[data-placement='bottom'] {
    top: 0;
    left: 50%;
    transform: translate(-50%, -95%) rotate(180deg);
  }

  wui-icon[data-placement='right'] {
    top: 50%;
    left: 0;
    transform: translate(-65%, -50%) rotate(90deg);
  }

  wui-icon[data-placement='left'] {
    top: 50%;
    right: 0%;
    transform: translate(65%, -50%) rotate(270deg);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;var Le=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let be=class extends A{constructor(){super(),this.unsubscribe=[],this.open=H.state.open,this.message=H.state.message,this.triggerRect=H.state.triggerRect,this.variant=H.state.variant,this.unsubscribe.push(H.subscribe(t=>{this.open=t.open,this.message=t.message,this.triggerRect=t.triggerRect,this.variant=t.variant}))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){this.dataset.variant=this.variant;const t=this.triggerRect.top,n=this.triggerRect.left;return this.style.cssText=`
    --w3m-tooltip-top: ${t}px;
    --w3m-tooltip-left: ${n}px;
    --w3m-tooltip-parent-width: ${this.triggerRect.width/2}px;
    --w3m-tooltip-display: ${this.open?"flex":"none"};
    --w3m-tooltip-opacity: ${this.open?1:0};
    `,c`<wui-flex>
      <wui-icon data-placement="top" size="inherit" name="cursor"></wui-icon>
      <wui-text color="primary" variant="sm-regular">${this.message}</wui-text>
    </wui-flex>`}};be.styles=[bi];Le([m()],be.prototype,"open",void 0);Le([m()],be.prototype,"message",void 0);Le([m()],be.prototype,"triggerRect",void 0);Le([m()],be.prototype,"variant",void 0);be=Le([k("w3m-tooltip")],be);const Pe={getTabsByNamespace(e){var n;return!!e&&e===P.CHAIN.EVM?((n=C.state.remoteFeatures)==null?void 0:n.activity)===!1?ye.ACCOUNT_TABS.filter(o=>o.label!=="Activity"):ye.ACCOUNT_TABS:[]},isValidReownName(e){return/^[a-zA-Z0-9]+$/gu.test(e)},isValidEmail(e){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/gu.test(e)},validateReownName(e){return e.replace(/\^/gu,"").toLowerCase().replace(/[^a-zA-Z0-9]/gu,"")},hasFooter(){var t;const e=w.state.view;if(ye.VIEWS_WITH_LEGAL_FOOTER.includes(e)){const{termsConditionsUrl:n,privacyPolicyUrl:o}=C.state,s=(t=C.state.features)==null?void 0:t.legalCheckbox;return!(!n&&!o||s)}return ye.VIEWS_WITH_DEFAULT_FOOTER.includes(e)}},vi=S`
  :host wui-ux-by-reown {
    padding-top: 0;
  }

  :host wui-ux-by-reown.branding-only {
    padding-top: ${({spacing:e})=>e[3]};
  }

  a {
    text-decoration: none;
    color: ${({tokens:e})=>e.core.textAccentPrimary};
    font-weight: 500;
  }
`;var Kt=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let Qe=class extends A{constructor(){super(),this.unsubscribe=[],this.remoteFeatures=C.state.remoteFeatures,this.unsubscribe.push(C.subscribeKey("remoteFeatures",t=>this.remoteFeatures=t))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){var i;const{termsConditionsUrl:t,privacyPolicyUrl:n}=C.state,o=(i=C.state.features)==null?void 0:i.legalCheckbox;return!t&&!n||o?c`
        <wui-flex flexDirection="column"> ${this.reownBrandingTemplate(!0)} </wui-flex>
      `:c`
      <wui-flex flexDirection="column">
        <wui-flex .padding=${["4","3","3","3"]} justifyContent="center">
          <wui-text color="secondary" variant="md-regular" align="center">
            By connecting your wallet, you agree to our <br />
            ${this.termsTemplate()} ${this.andTemplate()} ${this.privacyTemplate()}
          </wui-text>
        </wui-flex>
        ${this.reownBrandingTemplate()}
      </wui-flex>
    `}andTemplate(){const{termsConditionsUrl:t,privacyPolicyUrl:n}=C.state;return t&&n?"and":""}termsTemplate(){const{termsConditionsUrl:t}=C.state;return t?c`<a href=${t} target="_blank" rel="noopener noreferrer"
      >Terms of Service</a
    >`:null}privacyTemplate(){const{privacyPolicyUrl:t}=C.state;return t?c`<a href=${t} target="_blank" rel="noopener noreferrer"
      >Privacy Policy</a
    >`:null}reownBrandingTemplate(t=!1){var n;return(n=this.remoteFeatures)!=null&&n.reownBranding?t?c`<wui-ux-by-reown class="branding-only"></wui-ux-by-reown>`:c`<wui-ux-by-reown></wui-ux-by-reown>`:null}};Qe.styles=[vi];Kt([m()],Qe.prototype,"remoteFeatures",void 0);Qe=Kt([k("w3m-legal-footer")],Qe);const xi=Ke``;var ki=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let ut=class extends A{render(){const{termsConditionsUrl:t,privacyPolicyUrl:n}=C.state;return!t&&!n?null:c`
      <wui-flex
        .padding=${["4","3","3","3"]}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap="3"
      >
        <wui-text color="secondary" variant="md-regular" align="center">
          We work with the best providers to give you the lowest fees and best support. More options
          coming soon!
        </wui-text>

        ${this.howDoesItWorkTemplate()}
      </wui-flex>
    `}howDoesItWorkTemplate(){return c` <wui-link @click=${this.onWhatIsBuy.bind(this)}>
      <wui-icon size="xs" color="accent-primary" slot="iconLeft" name="helpCircle"></wui-icon>
      How does it work?
    </wui-link>`}onWhatIsBuy(){M.sendEvent({type:"track",event:"SELECT_WHAT_IS_A_BUY",properties:{isSmartAccount:ze(g.state.activeChain)===je.ACCOUNT_TYPES.SMART_ACCOUNT}}),w.push("WhatIsABuy")}};ut.styles=[xi];ut=ki([k("w3m-onramp-providers-footer")],ut);const Ti=S`
  :host {
    display: block;
  }

  div.container {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    overflow: hidden;
    height: auto;
    display: block;
  }

  div.container[status='hide'] {
    animation: fade-out;
    animation-duration: var(--apkt-duration-dynamic);
    animation-timing-function: ${({easings:e})=>e["ease-out-power-2"]};
    animation-fill-mode: both;
    animation-delay: 0s;
  }

  div.container[status='show'] {
    animation: fade-in;
    animation-duration: var(--apkt-duration-dynamic);
    animation-timing-function: ${({easings:e})=>e["ease-out-power-2"]};
    animation-fill-mode: both;
    animation-delay: var(--apkt-duration-dynamic);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      filter: blur(6px);
    }
    to {
      opacity: 1;
      filter: blur(0px);
    }
  }

  @keyframes fade-out {
    from {
      opacity: 1;
      filter: blur(0px);
    }
    to {
      opacity: 0;
      filter: blur(6px);
    }
  }
`;var Tt=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let We=class extends A{constructor(){super(...arguments),this.resizeObserver=void 0,this.unsubscribe=[],this.status="hide",this.view=w.state.view}firstUpdated(){this.status=Pe.hasFooter()?"show":"hide",this.unsubscribe.push(w.subscribeKey("view",t=>{this.view=t,this.status=Pe.hasFooter()?"show":"hide",this.status==="hide"&&document.documentElement.style.setProperty("--apkt-footer-height","0px")})),this.resizeObserver=new ResizeObserver(t=>{for(const n of t)if(n.target===this.getWrapper()){const o=`${n.contentRect.height}px`;document.documentElement.style.setProperty("--apkt-footer-height",o)}}),this.resizeObserver.observe(this.getWrapper())}render(){return c`
      <div class="container" status=${this.status}>${this.templatePageContainer()}</div>
    `}templatePageContainer(){return Pe.hasFooter()?c` ${this.templateFooter()}`:null}templateFooter(){switch(this.view){case"Networks":return this.templateNetworksFooter();case"Connect":case"ConnectWallets":case"OnRampFiatSelect":case"OnRampTokenSelect":return c`<w3m-legal-footer></w3m-legal-footer>`;case"OnRampProviders":return c`<w3m-onramp-providers-footer></w3m-onramp-providers-footer>`;default:return null}}templateNetworksFooter(){return c` <wui-flex
      class="footer-in"
      padding="3"
      flexDirection="column"
      gap="3"
      alignItems="center"
    >
      <wui-text variant="md-regular" color="secondary" align="center">
        Your connected wallet may not support some of the networks available for this dApp
      </wui-text>
      <wui-link @click=${this.onNetworkHelp.bind(this)}>
        <wui-icon size="sm" color="accent-primary" slot="iconLeft" name="helpCircle"></wui-icon>
        What is a network
      </wui-link>
    </wui-flex>`}onNetworkHelp(){M.sendEvent({type:"track",event:"CLICK_NETWORK_HELP"}),w.push("WhatIsANetwork")}getWrapper(){var t;return(t=this.shadowRoot)==null?void 0:t.querySelector("div.container")}};We.styles=[Ti];Tt([m()],We.prototype,"status",void 0);Tt([m()],We.prototype,"view",void 0);We=Tt([k("w3m-footer")],We);const Ai=S`
  :host {
    display: block;
    width: inherit;
  }
`;var At=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let De=class extends A{constructor(){super(),this.unsubscribe=[],this.viewState=w.state.view,this.history=w.state.history.join(","),this.unsubscribe.push(w.subscribeKey("view",()=>{this.history=w.state.history.join(","),document.documentElement.style.setProperty("--apkt-duration-dynamic","var(--apkt-durations-lg)")}))}disconnectedCallback(){this.unsubscribe.forEach(t=>t()),document.documentElement.style.setProperty("--apkt-duration-dynamic","0s")}render(){return c`${this.templatePageContainer()}`}templatePageContainer(){return c`<w3m-router-container
      history=${this.history}
      .setView=${()=>{this.viewState=w.state.view}}
    >
      ${this.viewTemplate(this.viewState)}
    </w3m-router-container>`}viewTemplate(t){switch(t){case"AccountSettings":return c`<w3m-account-settings-view></w3m-account-settings-view>`;case"Account":return c`<w3m-account-view></w3m-account-view>`;case"AllWallets":return c`<w3m-all-wallets-view></w3m-all-wallets-view>`;case"ApproveTransaction":return c`<w3m-approve-transaction-view></w3m-approve-transaction-view>`;case"BuyInProgress":return c`<w3m-buy-in-progress-view></w3m-buy-in-progress-view>`;case"ChooseAccountName":return c`<w3m-choose-account-name-view></w3m-choose-account-name-view>`;case"Connect":return c`<w3m-connect-view></w3m-connect-view>`;case"Create":return c`<w3m-connect-view walletGuide="explore"></w3m-connect-view>`;case"ConnectingWalletConnect":return c`<w3m-connecting-wc-view></w3m-connecting-wc-view>`;case"ConnectingWalletConnectBasic":return c`<w3m-connecting-wc-basic-view></w3m-connecting-wc-basic-view>`;case"ConnectingExternal":return c`<w3m-connecting-external-view></w3m-connecting-external-view>`;case"ConnectingSiwe":return c`<w3m-connecting-siwe-view></w3m-connecting-siwe-view>`;case"ConnectWallets":return c`<w3m-connect-wallets-view></w3m-connect-wallets-view>`;case"ConnectSocials":return c`<w3m-connect-socials-view></w3m-connect-socials-view>`;case"ConnectingSocial":return c`<w3m-connecting-social-view></w3m-connecting-social-view>`;case"DataCapture":return c`<w3m-data-capture-view></w3m-data-capture-view>`;case"DataCaptureOtpConfirm":return c`<w3m-data-capture-otp-confirm-view></w3m-data-capture-otp-confirm-view>`;case"Downloads":return c`<w3m-downloads-view></w3m-downloads-view>`;case"EmailLogin":return c`<w3m-email-login-view></w3m-email-login-view>`;case"EmailVerifyOtp":return c`<w3m-email-verify-otp-view></w3m-email-verify-otp-view>`;case"EmailVerifyDevice":return c`<w3m-email-verify-device-view></w3m-email-verify-device-view>`;case"GetWallet":return c`<w3m-get-wallet-view></w3m-get-wallet-view>`;case"Networks":return c`<w3m-networks-view></w3m-networks-view>`;case"SwitchNetwork":return c`<w3m-network-switch-view></w3m-network-switch-view>`;case"ProfileWallets":return c`<w3m-profile-wallets-view></w3m-profile-wallets-view>`;case"Transactions":return c`<w3m-transactions-view></w3m-transactions-view>`;case"OnRampProviders":return c`<w3m-onramp-providers-view></w3m-onramp-providers-view>`;case"OnRampTokenSelect":return c`<w3m-onramp-token-select-view></w3m-onramp-token-select-view>`;case"OnRampFiatSelect":return c`<w3m-onramp-fiat-select-view></w3m-onramp-fiat-select-view>`;case"UpgradeEmailWallet":return c`<w3m-upgrade-wallet-view></w3m-upgrade-wallet-view>`;case"UpdateEmailWallet":return c`<w3m-update-email-wallet-view></w3m-update-email-wallet-view>`;case"UpdateEmailPrimaryOtp":return c`<w3m-update-email-primary-otp-view></w3m-update-email-primary-otp-view>`;case"UpdateEmailSecondaryOtp":return c`<w3m-update-email-secondary-otp-view></w3m-update-email-secondary-otp-view>`;case"UnsupportedChain":return c`<w3m-unsupported-chain-view></w3m-unsupported-chain-view>`;case"Swap":return c`<w3m-swap-view></w3m-swap-view>`;case"SwapSelectToken":return c`<w3m-swap-select-token-view></w3m-swap-select-token-view>`;case"SwapPreview":return c`<w3m-swap-preview-view></w3m-swap-preview-view>`;case"WalletSend":return c`<w3m-wallet-send-view></w3m-wallet-send-view>`;case"WalletSendSelectToken":return c`<w3m-wallet-send-select-token-view></w3m-wallet-send-select-token-view>`;case"WalletSendPreview":return c`<w3m-wallet-send-preview-view></w3m-wallet-send-preview-view>`;case"WalletSendConfirmed":return c`<w3m-send-confirmed-view></w3m-send-confirmed-view>`;case"WhatIsABuy":return c`<w3m-what-is-a-buy-view></w3m-what-is-a-buy-view>`;case"WalletReceive":return c`<w3m-wallet-receive-view></w3m-wallet-receive-view>`;case"WalletCompatibleNetworks":return c`<w3m-wallet-compatible-networks-view></w3m-wallet-compatible-networks-view>`;case"WhatIsAWallet":return c`<w3m-what-is-a-wallet-view></w3m-what-is-a-wallet-view>`;case"ConnectingMultiChain":return c`<w3m-connecting-multi-chain-view></w3m-connecting-multi-chain-view>`;case"WhatIsANetwork":return c`<w3m-what-is-a-network-view></w3m-what-is-a-network-view>`;case"ConnectingFarcaster":return c`<w3m-connecting-farcaster-view></w3m-connecting-farcaster-view>`;case"SwitchActiveChain":return c`<w3m-switch-active-chain-view></w3m-switch-active-chain-view>`;case"RegisterAccountName":return c`<w3m-register-account-name-view></w3m-register-account-name-view>`;case"RegisterAccountNameSuccess":return c`<w3m-register-account-name-success-view></w3m-register-account-name-success-view>`;case"SmartSessionCreated":return c`<w3m-smart-session-created-view></w3m-smart-session-created-view>`;case"SmartSessionList":return c`<w3m-smart-session-list-view></w3m-smart-session-list-view>`;case"SIWXSignMessage":return c`<w3m-siwx-sign-message-view></w3m-siwx-sign-message-view>`;case"Pay":return c`<w3m-pay-view></w3m-pay-view>`;case"PayLoading":return c`<w3m-pay-loading-view></w3m-pay-loading-view>`;case"PayQuote":return c`<w3m-pay-quote-view></w3m-pay-quote-view>`;case"FundWallet":return c`<w3m-fund-wallet-view></w3m-fund-wallet-view>`;case"PayWithExchange":return c`<w3m-deposit-from-exchange-view></w3m-deposit-from-exchange-view>`;case"PayWithExchangeSelectAsset":return c`<w3m-deposit-from-exchange-select-asset-view></w3m-deposit-from-exchange-select-asset-view>`;case"UsageExceeded":return c`<w3m-usage-exceeded-view></w3m-usage-exceeded-view>`;case"SmartAccountSettings":return c`<w3m-smart-account-settings-view></w3m-smart-account-settings-view>`;default:return c`<w3m-connect-view></w3m-connect-view>`}}};De.styles=[Ai];At([m()],De.prototype,"viewState",void 0);At([m()],De.prototype,"history",void 0);De=At([k("w3m-router")],De);const Si=S`
  :host {
    z-index: ${({tokens:e})=>e.core.zIndex};
    display: block;
    backface-visibility: hidden;
    will-change: opacity;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    opacity: 0;
    background-color: ${({tokens:e})=>e.theme.overlay};
    backdrop-filter: blur(0px);
    transition:
      opacity ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      backdrop-filter ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]};
    will-change: opacity;
  }

  :host(.open) {
    opacity: 1;
    backdrop-filter: blur(8px);
  }

  :host(.appkit-modal) {
    position: relative;
    pointer-events: unset;
    background: none;
    width: 100%;
    opacity: 1;
  }

  wui-card {
    max-width: var(--apkt-modal-width);
    width: 100%;
    position: relative;
    outline: none;
    transform: translateY(4px);
    box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.05);
    transition:
      transform ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      border-radius ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-1"]},
      background-color ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-1"]},
      box-shadow ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-1"]};
    will-change: border-radius, background-color, transform, box-shadow;
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    padding: var(--local-modal-padding);
    box-sizing: border-box;
  }

  :host(.open) wui-card {
    transform: translateY(0px);
  }

  wui-card::before {
    z-index: 1;
    pointer-events: none;
    content: '';
    position: absolute;
    inset: 0;
    border-radius: clamp(0px, var(--apkt-borderRadius-8), 44px);
    transition: box-shadow ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    transition-delay: ${({durations:e})=>e.md};
    will-change: box-shadow;
  }

  :host([data-mobile-fullscreen='true']) wui-card::before {
    border-radius: 0px;
  }

  :host([data-border='true']) wui-card::before {
    box-shadow: inset 0px 0px 0px 4px ${({tokens:e})=>e.theme.foregroundSecondary};
  }

  :host([data-border='false']) wui-card::before {
    box-shadow: inset 0px 0px 0px 1px ${({tokens:e})=>e.theme.borderPrimaryDark};
  }

  :host([data-border='true']) wui-card {
    animation:
      fade-in ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      card-background-border var(--apkt-duration-dynamic)
        ${({easings:e})=>e["ease-out-power-2"]};
    animation-fill-mode: backwards, both;
    animation-delay: var(--apkt-duration-dynamic);
  }

  :host([data-border='false']) wui-card {
    animation:
      fade-in ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      card-background-default var(--apkt-duration-dynamic)
        ${({easings:e})=>e["ease-out-power-2"]};
    animation-fill-mode: backwards, both;
    animation-delay: 0s;
  }

  :host(.appkit-modal) wui-card {
    max-width: var(--apkt-modal-width);
  }

  wui-card[shake='true'] {
    animation:
      fade-in ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      w3m-shake ${({durations:e})=>e.xl}
        ${({easings:e})=>e["ease-out-power-2"]};
  }

  wui-flex {
    overflow-x: hidden;
    overflow-y: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  @media (max-height: 700px) and (min-width: 431px) {
    wui-flex {
      align-items: flex-start;
    }

    wui-card {
      margin: var(--apkt-spacing-6) 0px;
    }
  }

  @media (max-width: 430px) {
    :host([data-mobile-fullscreen='true']) {
      height: 100dvh;
    }
    :host([data-mobile-fullscreen='true']) wui-flex {
      align-items: stretch;
    }
    :host([data-mobile-fullscreen='true']) wui-card {
      max-width: 100%;
      height: 100%;
      border-radius: 0;
      border: none;
    }
    :host(:not([data-mobile-fullscreen='true'])) wui-flex {
      align-items: flex-end;
    }

    :host(:not([data-mobile-fullscreen='true'])) wui-card {
      max-width: 100%;
      border-bottom: none;
    }

    :host(:not([data-mobile-fullscreen='true'])) wui-card[data-embedded='true'] {
      border-bottom-left-radius: clamp(0px, var(--apkt-borderRadius-8), 44px);
      border-bottom-right-radius: clamp(0px, var(--apkt-borderRadius-8), 44px);
    }

    :host(:not([data-mobile-fullscreen='true'])) wui-card:not([data-embedded='true']) {
      border-bottom-left-radius: 0px;
      border-bottom-right-radius: 0px;
    }

    wui-card[shake='true'] {
      animation: w3m-shake 0.5s ${({easings:e})=>e["ease-out-power-2"]};
    }
  }

  @keyframes fade-in {
    0% {
      transform: scale(0.99) translateY(4px);
    }
    100% {
      transform: scale(1) translateY(0);
    }
  }

  @keyframes w3m-shake {
    0% {
      transform: scale(1) rotate(0deg);
    }
    20% {
      transform: scale(1) rotate(-1deg);
    }
    40% {
      transform: scale(1) rotate(1.5deg);
    }
    60% {
      transform: scale(1) rotate(-1.5deg);
    }
    80% {
      transform: scale(1) rotate(1deg);
    }
    100% {
      transform: scale(1) rotate(0deg);
    }
  }

  @keyframes card-background-border {
    from {
      background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    }
    to {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
  }

  @keyframes card-background-default {
    from {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
    to {
      background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    }
  }
`;var ae=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};const Dt="scroll-lock",Ii={PayWithExchange:"0",PayWithExchangeSelectAsset:"0",Pay:"0",PayQuote:"0",PayLoading:"0"};class te extends A{constructor(){super(),this.unsubscribe=[],this.abortController=void 0,this.hasPrefetched=!1,this.enableEmbedded=C.state.enableEmbedded,this.open=L.state.open,this.caipAddress=g.state.activeCaipAddress,this.caipNetwork=g.state.activeCaipNetwork,this.shake=L.state.shake,this.filterByNamespace=B.state.filterByNamespace,this.padding=$e.spacing[1],this.mobileFullScreen=C.state.enableMobileFullScreen,this.initializeTheming(),Be.prefetchAnalyticsConfig(),this.unsubscribe.push(L.subscribeKey("open",t=>t?this.onOpen():this.onClose()),L.subscribeKey("shake",t=>this.shake=t),g.subscribeKey("activeCaipNetwork",t=>this.onNewNetwork(t)),g.subscribeKey("activeCaipAddress",t=>this.onNewAddress(t)),C.subscribeKey("enableEmbedded",t=>this.enableEmbedded=t),B.subscribeKey("filterByNamespace",t=>{var n;this.filterByNamespace!==t&&!((n=g.getAccountData(t))!=null&&n.caipAddress)&&(Be.fetchRecommendedWallets(),this.filterByNamespace=t)}),w.subscribeKey("view",()=>{this.dataset.border=Pe.hasFooter()?"true":"false",this.padding=Ii[w.state.view]??$e.spacing[1]}))}firstUpdated(){if(this.dataset.border=Pe.hasFooter()?"true":"false",this.mobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),this.caipAddress){if(this.enableEmbedded){L.close(),this.prefetch();return}this.onNewAddress(this.caipAddress)}this.open&&this.onOpen(),this.enableEmbedded&&this.prefetch()}disconnectedCallback(){this.unsubscribe.forEach(t=>t()),this.onRemoveKeyboardListener()}render(){return this.style.setProperty("--local-modal-padding",this.padding),this.enableEmbedded?c`${this.contentTemplate()}
        <w3m-tooltip></w3m-tooltip> `:this.open?c`
          <wui-flex @click=${this.onOverlayClick.bind(this)} data-testid="w3m-modal-overlay">
            ${this.contentTemplate()}
          </wui-flex>
          <w3m-tooltip></w3m-tooltip>
        `:null}contentTemplate(){return c` <wui-card
      shake="${this.shake}"
      data-embedded="${T(this.enableEmbedded)}"
      role="alertdialog"
      aria-modal="true"
      tabindex="0"
      data-testid="w3m-modal-card"
    >
      <w3m-header></w3m-header>
      <w3m-router></w3m-router>
      <w3m-footer></w3m-footer>
      <w3m-snackbar></w3m-snackbar>
      <w3m-alertbar></w3m-alertbar>
    </wui-card>`}async onOverlayClick(t){if(t.target===t.currentTarget){if(this.mobileFullScreen)return;await this.handleClose()}}async handleClose(){await Vt.safeClose()}initializeTheming(){const{themeVariables:t,themeMode:n}=nn.state,o=Ze.getColorTheme(n);on(t,o)}onClose(){this.open=!1,this.classList.remove("open"),this.onScrollUnlock(),I.hide(),this.onRemoveKeyboardListener()}onOpen(){this.open=!0,this.classList.add("open"),this.onScrollLock(),this.onAddKeyboardListener()}onScrollLock(){const t=document.createElement("style");t.dataset.w3m=Dt,t.textContent=`
      body {
        touch-action: none;
        overflow: hidden;
        overscroll-behavior: contain;
      }
      w3m-modal {
        pointer-events: auto;
      }
    `,document.head.appendChild(t)}onScrollUnlock(){const t=document.head.querySelector(`style[data-w3m="${Dt}"]`);t&&t.remove()}onAddKeyboardListener(){var n;this.abortController=new AbortController;const t=(n=this.shadowRoot)==null?void 0:n.querySelector("wui-card");t==null||t.focus(),window.addEventListener("keydown",o=>{if(o.key==="Escape")this.handleClose();else if(o.key==="Tab"){const{tagName:s}=o.target;s&&!s.includes("W3M-")&&!s.includes("WUI-")&&(t==null||t.focus())}},this.abortController)}onRemoveKeyboardListener(){var t;(t=this.abortController)==null||t.abort(),this.abortController=void 0}async onNewAddress(t){const n=g.state.isSwitchingNamespace,o=w.state.view==="ProfileWallets";!t&&!n&&!o&&L.close(),await qt.initializeIfEnabled(t),this.caipAddress=t,g.setIsSwitchingNamespace(!1)}onNewNetwork(t){var y,E;const n=this.caipNetwork,o=(y=n==null?void 0:n.caipNetworkId)==null?void 0:y.toString(),s=(E=t==null?void 0:t.caipNetworkId)==null?void 0:E.toString(),i=o!==s,r=w.state.view==="UnsupportedChain",a=L.state.open;let d=!1;this.enableEmbedded&&w.state.view==="SwitchNetwork"&&(d=!0),i&&f.resetState(),a&&r&&(d=!0),d&&w.state.view!=="SIWXSignMessage"&&w.goBack(),this.caipNetwork=t}prefetch(){this.hasPrefetched||(Be.prefetch(),Be.fetchWalletsByPage({page:1}),this.hasPrefetched=!0)}}te.styles=Si;ae([p({type:Boolean})],te.prototype,"enableEmbedded",void 0);ae([m()],te.prototype,"open",void 0);ae([m()],te.prototype,"caipAddress",void 0);ae([m()],te.prototype,"caipNetwork",void 0);ae([m()],te.prototype,"shake",void 0);ae([m()],te.prototype,"filterByNamespace",void 0);ae([m()],te.prototype,"padding",void 0);ae([m()],te.prototype,"mobileFullScreen",void 0);let Lt=class extends te{};Lt=ae([k("w3m-modal")],Lt);let Bt=class extends te{};Bt=ae([k("appkit-modal")],Bt);const Ei=S`
  .icon-box {
    width: 64px;
    height: 64px;
    border-radius: ${({borderRadius:e})=>e[5]};
    background-color: ${({colors:e})=>e.semanticError010};
  }
`;var Ci=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let dt=class extends A{constructor(){super()}render(){return c`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        gap="4"
        .padding="${["1","3","4","3"]}"
      >
        <wui-flex justifyContent="center" alignItems="center" class="icon-box">
          <wui-icon size="xxl" color="error" name="warningCircle"></wui-icon>
        </wui-flex>

        <wui-text variant="lg-medium" color="primary" align="center">
          The app isn't responding as expected
        </wui-text>
        <wui-text variant="md-regular" color="secondary" align="center">
          Try again or reach out to the app team for help.
        </wui-text>

        <wui-button
          variant="neutral-secondary"
          size="md"
          @click=${this.onTryAgainClick.bind(this)}
          data-testid="w3m-usage-exceeded-button"
        >
          <wui-icon color="inherit" slot="iconLeft" name="refresh"></wui-icon>
          Try Again
        </wui-button>
      </wui-flex>
    `}onTryAgainClick(){w.goBack()}};dt.styles=Ei;dt=Ci([k("w3m-usage-exceeded-view")],dt);const Pi=S`
  :host {
    width: 100%;
  }
`;var U=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};let _=class extends A{constructor(){super(...arguments),this.hasImpressionSent=!1,this.walletImages=[],this.imageSrc="",this.name="",this.size="md",this.tabIdx=void 0,this.disabled=!1,this.showAllWallets=!1,this.loading=!1,this.loadingSpinnerColor="accent-100",this.rdnsId="",this.displayIndex=void 0,this.walletRank=void 0,this.namespaces=[]}connectedCallback(){super.connectedCallback()}disconnectedCallback(){super.disconnectedCallback(),this.cleanupIntersectionObserver()}updated(t){super.updated(t),(t.has("name")||t.has("imageSrc")||t.has("walletRank"))&&(this.hasImpressionSent=!1),t.has("walletRank")&&this.walletRank&&!this.intersectionObserver&&this.setupIntersectionObserver()}setupIntersectionObserver(){this.intersectionObserver=new IntersectionObserver(t=>{t.forEach(n=>{n.isIntersecting&&!this.loading&&!this.hasImpressionSent&&this.sendImpressionEvent()})},{threshold:.1}),this.intersectionObserver.observe(this)}cleanupIntersectionObserver(){this.intersectionObserver&&(this.intersectionObserver.disconnect(),this.intersectionObserver=void 0)}sendImpressionEvent(){!this.name||this.hasImpressionSent||!this.walletRank||(this.hasImpressionSent=!0,(this.rdnsId||this.name)&&M.sendWalletImpressionEvent({name:this.name,walletRank:this.walletRank,rdnsId:this.rdnsId,view:w.state.view,displayIndex:this.displayIndex}))}handleGetWalletNamespaces(){return Object.keys(sn.state.adapters).length>1?this.namespaces:[]}render(){return c`
      <wui-list-wallet
        .walletImages=${this.walletImages}
        imageSrc=${T(this.imageSrc)}
        name=${this.name}
        size=${T(this.size)}
        tagLabel=${T(this.tagLabel)}
        .tagVariant=${this.tagVariant}
        .walletIcon=${this.walletIcon}
        .tabIdx=${this.tabIdx}
        .disabled=${this.disabled}
        .showAllWallets=${this.showAllWallets}
        .loading=${this.loading}
        loadingSpinnerColor=${this.loadingSpinnerColor}
        .namespaces=${this.handleGetWalletNamespaces()}
      ></wui-list-wallet>
    `}};_.styles=Pi;U([p({type:Array})],_.prototype,"walletImages",void 0);U([p()],_.prototype,"imageSrc",void 0);U([p()],_.prototype,"name",void 0);U([p()],_.prototype,"size",void 0);U([p()],_.prototype,"tagLabel",void 0);U([p()],_.prototype,"tagVariant",void 0);U([p()],_.prototype,"walletIcon",void 0);U([p()],_.prototype,"tabIdx",void 0);U([p({type:Boolean})],_.prototype,"disabled",void 0);U([p({type:Boolean})],_.prototype,"showAllWallets",void 0);U([p({type:Boolean})],_.prototype,"loading",void 0);U([p({type:String})],_.prototype,"loadingSpinnerColor",void 0);U([p()],_.prototype,"rdnsId",void 0);U([p()],_.prototype,"displayIndex",void 0);U([p()],_.prototype,"walletRank",void 0);U([p({type:Array})],_.prototype,"namespaces",void 0);_=U([k("w3m-list-wallet")],_);const $i=S`
  :host {
    --local-duration-height: 0s;
    --local-duration: ${({durations:e})=>e.lg};
    --local-transition: ${({easings:e})=>e["ease-out-power-2"]};
  }

  .container {
    display: block;
    overflow: hidden;
    overflow: hidden;
    position: relative;
    height: var(--local-container-height);
    transition: height var(--local-duration-height) var(--local-transition);
    will-change: height, padding-bottom;
  }

  .container[data-mobile-fullscreen='true'] {
    overflow: scroll;
  }

  .page {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    height: auto;
    width: inherit;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    border-bottom-left-radius: var(--local-border-bottom-radius);
    border-bottom-right-radius: var(--local-border-bottom-radius);
    transition: border-bottom-left-radius var(--local-duration) var(--local-transition);
  }

  .page[data-mobile-fullscreen='true'] {
    height: 100%;
  }

  .page-content {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }

  .footer {
    height: var(--apkt-footer-height);
  }

  div.page[view-direction^='prev-'] .page-content {
    animation:
      slide-left-out var(--local-duration) forwards var(--local-transition),
      slide-left-in var(--local-duration) forwards var(--local-transition);
    animation-delay: 0ms, var(--local-duration, ${({durations:e})=>e.lg});
  }

  div.page[view-direction^='next-'] .page-content {
    animation:
      slide-right-out var(--local-duration) forwards var(--local-transition),
      slide-right-in var(--local-duration) forwards var(--local-transition);
    animation-delay: 0ms, var(--local-duration, ${({durations:e})=>e.lg});
  }

  @keyframes slide-left-out {
    from {
      transform: translateX(0px) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
    to {
      transform: translateX(8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
  }

  @keyframes slide-left-in {
    from {
      transform: translateX(-8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
    to {
      transform: translateX(0) translateY(0) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
  }

  @keyframes slide-right-out {
    from {
      transform: translateX(0px) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
    to {
      transform: translateX(-8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
  }

  @keyframes slide-right-in {
    from {
      transform: translateX(8px) scale(0.99);
      opacity: 0;
      filter: blur(4px);
    }
    to {
      transform: translateX(0) translateY(0) scale(1);
      opacity: 1;
      filter: blur(0px);
    }
  }
`;var ce=function(e,t,n,o){var s=arguments.length,i=s<3?t:o===null?o=Object.getOwnPropertyDescriptor(t,n):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")i=Reflect.decorate(e,t,n,o);else for(var a=e.length-1;a>=0;a--)(r=e[a])&&(i=(s<3?r(i):s>3?r(t,n,i):r(t,n))||i);return s>3&&i&&Object.defineProperty(t,n,i),i};const Ni=60;let Q=class extends A{constructor(){super(...arguments),this.resizeObserver=void 0,this.transitionDuration="0.15s",this.transitionFunction="",this.history="",this.view="",this.setView=void 0,this.viewDirection="",this.historyState="",this.previousHeight="0px",this.mobileFullScreen=C.state.enableMobileFullScreen,this.onViewportResize=()=>{this.updateContainerHeight()}}updated(t){if(t.has("history")){const n=this.history;this.historyState!==""&&this.historyState!==n&&this.onViewChange(n)}t.has("transitionDuration")&&this.style.setProperty("--local-duration",this.transitionDuration),t.has("transitionFunction")&&this.style.setProperty("--local-transition",this.transitionFunction)}firstUpdated(){var t;this.transitionFunction&&this.style.setProperty("--local-transition",this.transitionFunction),this.style.setProperty("--local-duration",this.transitionDuration),this.historyState=this.history,this.resizeObserver=new ResizeObserver(n=>{var o;for(const s of n)if(s.target===this.getWrapper()){let i=s.contentRect.height;const r=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--apkt-footer-height")||"0");if(this.mobileFullScreen){const a=((o=window.visualViewport)==null?void 0:o.height)||window.innerHeight,d=this.getHeaderHeight();i=a-d-r,this.style.setProperty("--local-border-bottom-radius","0px")}else i=i+r,this.style.setProperty("--local-border-bottom-radius",r?"var(--apkt-borderRadius-5)":"0px");this.style.setProperty("--local-container-height",`${i}px`),this.previousHeight!=="0px"&&this.style.setProperty("--local-duration-height",this.transitionDuration),this.previousHeight=`${i}px`}}),this.resizeObserver.observe(this.getWrapper()),this.updateContainerHeight(),window.addEventListener("resize",this.onViewportResize),(t=window.visualViewport)==null||t.addEventListener("resize",this.onViewportResize)}disconnectedCallback(){var n;const t=this.getWrapper();t&&this.resizeObserver&&this.resizeObserver.unobserve(t),window.removeEventListener("resize",this.onViewportResize),(n=window.visualViewport)==null||n.removeEventListener("resize",this.onViewportResize)}render(){return c`
      <div class="container" data-mobile-fullscreen="${T(this.mobileFullScreen)}">
        <div
          class="page"
          data-mobile-fullscreen="${T(this.mobileFullScreen)}"
          view-direction="${this.viewDirection}"
        >
          <div class="page-content">
            <slot></slot>
          </div>
        </div>
      </div>
    `}onViewChange(t){const n=t.split(",").filter(Boolean),o=this.historyState.split(",").filter(Boolean),s=o.length,i=n.length,r=n[n.length-1]||"",a=Ze.cssDurationToNumber(this.transitionDuration);let d="";i>s?d="next":i<s?d="prev":i===s&&n[i-1]!==o[s-1]&&(d="next"),this.viewDirection=`${d}-${r}`,setTimeout(()=>{var y;this.historyState=t,(y=this.setView)==null||y.call(this,r)},a),setTimeout(()=>{this.viewDirection=""},a*2)}getWrapper(){var t;return(t=this.shadowRoot)==null?void 0:t.querySelector("div.page")}updateContainerHeight(){var s;const t=this.getWrapper();if(!t)return;const n=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--apkt-footer-height")||"0");let o=0;if(this.mobileFullScreen){const i=((s=window.visualViewport)==null?void 0:s.height)||window.innerHeight,r=this.getHeaderHeight();o=i-r-n,this.style.setProperty("--local-border-bottom-radius","0px")}else o=t.getBoundingClientRect().height+n,this.style.setProperty("--local-border-bottom-radius",n?"var(--apkt-borderRadius-5)":"0px");this.style.setProperty("--local-container-height",`${o}px`),this.previousHeight!=="0px"&&this.style.setProperty("--local-duration-height",this.transitionDuration),this.previousHeight=`${o}px`}getHeaderHeight(){return Ni}};Q.styles=[$i];ce([p({type:String})],Q.prototype,"transitionDuration",void 0);ce([p({type:String})],Q.prototype,"transitionFunction",void 0);ce([p({type:String})],Q.prototype,"history",void 0);ce([p({type:String})],Q.prototype,"view",void 0);ce([p({attribute:!1})],Q.prototype,"setView",void 0);ce([m()],Q.prototype,"viewDirection",void 0);ce([m()],Q.prototype,"historyState",void 0);ce([m()],Q.prototype,"previousHeight",void 0);ce([m()],Q.prototype,"mobileFullScreen",void 0);Q=ce([k("w3m-router-container")],Q);export{Bt as AppKitModal,_ as W3mListWallet,Lt as W3mModal,te as W3mModalBase,Q as W3mRouterContainer,dt as W3mUsageExceededView};
