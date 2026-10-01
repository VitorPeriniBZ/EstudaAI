import fs from "node:fs";
import path from "node:path";
const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "fixtures");
const B=process.env.AGENT_BASE_URL; let pass=0, fail=0;
const ok=(c,n,x="")=>{ if(c){pass++;console.log("  ✔",n);} else {fail++;console.log("  ✘",n,x);} };
async function login(code){ const r1=await fetch(B+"/api/auth/google",{redirect:"manual"});
  const c1=r1.headers.getSetCookie().map(c=>c.split(";")[0]).join("; "); const st=new URL(r1.headers.get("location")).searchParams.get("state");
  const r2=await fetch(`${B}/api/auth/google/callback?code=${code}&state=${st}`,{redirect:"manual",headers:{cookie:c1}});
  return r2.headers.getSetCookie().find(c=>c.startsWith("estudaai_sid=")).split(";")[0]; }
async function t(ck,p,input,q){ const url=`${B}/api/trpc/${p}`+(q?`?input=${encodeURIComponent(JSON.stringify({json:input??null}))}`:"");
  const r=await fetch(url,{method:q?"GET":"POST",headers:{"content-type":"application/json",cookie:ck},body:q?undefined:JSON.stringify({json:input??null})});
  const j=await r.json(); return { data:j.result?.data?.json, error:j.error?.json }; }
const A=await login("code-ana"), U=await login("code-bia");
const prov=(await t(A,"admin.createProvider",{name:"Falha",type:"openai",apiKey:"sk-fail-1234567",baseUrl:"http://localhost:4002/fail/v1",model:"m",priority:1})).data.id;
const s=(await t(U,"subjects.create",{name:"P"})).data.id;
await t(U,"materials.createNote",{subjectId:s,title:"n",content:"Ascaris vive no jejuno."});

console.log("\nGeração que falha não consome vaga");
const f=await t(U,"study.generateQuiz",{subjectId:s,count:5});
ok(!!f.error, "geração falhou (IA indisponível)");
ok((await t(U,"account.usage",null,true)).data.usage.generations===0, "vaga estornada: 0 gerações usadas");

console.log("\n10 pedidos simultâneos (limite 5)");
await t(A,"admin.updateProvider",{id:prov, baseUrl:"http://localhost:4002/ok/v1", apiKey:"sk-ok-1234567"});
const res=await Promise.all(Array.from({length:10},()=>t(U,"study.generateQuiz",{subjectId:s,count:5})));
const okN=res.filter(r=>r.data).length, forb=res.filter(r=>r.error?.data?.code==="FORBIDDEN").length;
console.log(`   aceitos: ${okN} · bloqueados: ${forb}`);
ok(okN===5 && forb===5, "exatamente 5 aceitos e 5 bloqueados");
ok((await t(U,"account.usage",null,true)).data.usage.generations===5, "contador em 5");

console.log("\n6 uploads simultâneos (limite 3)");
const pdf=fs.readFileSync(path.join(FIX, "aula.pdf")).toString("base64");
const ups=await Promise.all(Array.from({length:6},(_,i)=>t(U,"materials.uploadFile",{subjectId:s,name:`a${i}.pdf`,contentBase64:pdf,contentType:"application/pdf"})));
const upOk=ups.filter(r=>r.data).length; console.log(`   aceitos: ${upOk} · bloqueados: ${ups.length-upOk}`);
ok(upOk===3, "exatamente 3 arquivos aceitos");
ok((await t(U,"account.usage",null,true)).data.usage.files===3, "contador de arquivos em 3");
console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail?1:0);
