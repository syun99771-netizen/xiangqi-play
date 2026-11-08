import{createNodeClient}from'./node-client.mjs';import{START_FEN}from'./api.mjs';
const client=createNodeClient();try{const result=await client.search({requestId:'example',fen:START_FEN,moves:[],historyComplete:true,options:{ruleProfile:'pikafish-public-b562'},limits:{nodes:128,depth:1}});console.log(JSON.stringify(result,null,2));}finally{await client.close();}
