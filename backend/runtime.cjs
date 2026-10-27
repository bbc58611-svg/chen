'use strict';
const path=require('node:path');
const loopbackHost=host=>/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host);

function publicOrigin(value){
  if(!value)return null;
  let url;
  try{url=new URL(value);}catch{throw Error('PUBLIC_ORIGIN must be the HTTPS origin of your deployed Momo page.');}
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!url.hostname||loopbackHost(url.host))throw Error('PUBLIC_ORIGIN must be an HTTPS origin without a path, credentials, query or fragment.');
  return url.origin;
}

function runtimeConfig(env=process.env,root=path.resolve(__dirname,'..')){
  const origin=publicOrigin((env.PUBLIC_ORIGIN||(env.RENDER==='true'?env.RENDER_EXTERNAL_URL:'')||'').trim());
  const port=Number(env.PORT||4173);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be an integer from 1 to 65535');
  const configuredHost=origin?new URL(origin).host:null;
  const storeFile=path.join(path.resolve(root,env.DATA_DIR||'.local'),'paypal-sandbox-orders.json');
  return {
    port,bindHost:origin?'0.0.0.0':'127.0.0.1',origin,storeFile,
    allowsHost:host=>origin?host===configuredHost||loopbackHost(host):loopbackHost(host),
    requestOrigin:host=>origin||`http://${host}`
  };
}

module.exports={runtimeConfig,publicOrigin};
