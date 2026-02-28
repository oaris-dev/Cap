import type { PropsWithChildren } from "react";

const sandboxPatchScript = [
	"(function(){",
	"var o=history.pushState,r=history.replaceState;",
	"history.pushState=function(){try{return o.apply(this,arguments)}catch(e){}};",
	"history.replaceState=function(){try{return r.apply(this,arguments)}catch(e){}};",
	"function makeStorage(){var d={};return{getItem:function(k){return d.hasOwnProperty(k)?d[k]:null},",
	"setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},",
	"clear:function(){d={}},get length(){return Object.keys(d).length},",
	"key:function(i){var keys=Object.keys(d);return i<keys.length?keys[i]:null}};}",
	"try{sessionStorage.setItem('__t','1');sessionStorage.removeItem('__t')}",
	"catch(e){Object.defineProperty(window,'sessionStorage',{value:makeStorage(),writable:false})}",
	"try{localStorage.setItem('__t','1');localStorage.removeItem('__t')}",
	"catch(e){Object.defineProperty(window,'localStorage',{value:makeStorage(),writable:false})}",
	"try{void document.cookie}catch(e){Object.defineProperty(document,'cookie',{get:function(){return ''},set:function(){}})}",
	"})();",
].join("");

export default function EmbedLayout({ children }: PropsWithChildren) {
	return (
		<>
			<script dangerouslySetInnerHTML={{ __html: sandboxPatchScript }} />
			{children}
		</>
	);
}
