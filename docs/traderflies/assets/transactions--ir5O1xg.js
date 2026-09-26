import{cR as f,cL as a,cM as d,cK as u}from"./index-DLeu_Pgq.js";const w=f`
  :host > wui-flex:first-child {
    height: 500px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }

  :host > wui-flex:first-child::-webkit-scrollbar {
    display: none;
  }
`;var p=function(n,t,i,l){var o=arguments.length,e=o<3?t:l===null?l=Object.getOwnPropertyDescriptor(t,i):l,c;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")e=Reflect.decorate(n,t,i,l);else for(var r=n.length-1;r>=0;r--)(c=n[r])&&(e=(o<3?c(e):o>3?c(t,i,e):c(t,i))||e);return o>3&&e&&Object.defineProperty(t,i,e),e};let s=class extends a{render(){return d`
      <wui-flex flexDirection="column" .padding=${["0","3","3","3"]} gap="3">
        <w3m-activity-list page="activity"></w3m-activity-list>
      </wui-flex>
    `}};s.styles=w;s=p([u("w3m-transactions-view")],s);export{s as W3mTransactionsView};
