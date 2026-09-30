import{dj as f,dd as a,de as d,dc as u}from"./index-ntFDb7JD.js";const w=f`
  :host > wui-flex:first-child {
    height: 500px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }

  :host > wui-flex:first-child::-webkit-scrollbar {
    display: none;
  }
`;var p=function(n,t,i,l){var o=arguments.length,e=o<3?t:l===null?l=Object.getOwnPropertyDescriptor(t,i):l,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")e=Reflect.decorate(n,t,i,l);else for(var s=n.length-1;s>=0;s--)(r=n[s])&&(e=(o<3?r(e):o>3?r(t,i,e):r(t,i))||e);return o>3&&e&&Object.defineProperty(t,i,e),e};let c=class extends a{render(){return d`
      <wui-flex flexDirection="column" .padding=${["0","3","3","3"]} gap="3">
        <w3m-activity-list page="activity"></w3m-activity-list>
      </wui-flex>
    `}};c.styles=w;c=p([u("w3m-transactions-view")],c);export{c as W3mTransactionsView};
