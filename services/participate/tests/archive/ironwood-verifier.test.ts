// @vitest-environment node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readPilotPackages } from "@/lib/archive/catalog";
import { archiveMemo } from "@/lib/archive/format";

it("runs the downloadable Ironwood verifier and rejects pool or value substitution without network or database access", async () => {
  const folder = await mkdtemp(join(tmpdir(), "participate-ironwood-verifier-"));
  try {
    const checked = (await readPilotPackages())[0], file = join(folder, "proposal.zvoice.json"), preload = join(folder, "reader.mjs"), target = join(folder, "recovered");
    const txid = "a".repeat(64), blockHash = "b".repeat(64), tipHash = "c".repeat(64), account = "7ada62b6-2a31-48a1-b0b0-b93caca714d2";
    const receiver = "u1" + "q".repeat(100), key = "uview1" + "q".repeat(150);
    const memoBytes = Buffer.from(archiveMemo(checked.manifest, checked.manifestHash, "mainnet"));
    const memo = Buffer.concat([memoBytes, Buffer.alloc(512 - memoBytes.length)]).toString("hex");
    const values = { txid, blockHash, tipHash, account, receiver, key, memo };
    await writeFile(file, JSON.stringify(checked.bundle));
    await writeFile(preload, `const v=${JSON.stringify(values)};
globalThis.fetch=async (_url,init)=>{
 const {method,params}=JSON.parse(init.body), time=Math.floor(Date.now()/1000);
 const methods=['z_exportviewingkey','z_listaccounts','z_listunifiedreceivers','z_getaddressforaccount','getwalletstatus','z_viewtransaction'];
 let result;
 if(method==='rpc.discover') result={info:{title:'Zallet',version:'0.1.0-beta.3'},methods:methods.map(name=>({name}))};
 else if(method==='getblockchaininfo') result={chain:'main',blocks:100,headers:100,bestblockhash:v.tipHash,verificationprogress:1};
 else if(method==='z_listunifiedreceivers') result={orchard:v.receiver};
 else if(method==='z_listaccounts') result=[{account_uuid:v.account,addresses:[{ua:v.receiver,diversifier_index:0}]}];
 else if(method==='z_exportviewingkey') result=v.key;
 else if(method==='z_getaddressforaccount') result={address:v.receiver,diversifier_index:0};
 else if(method==='getwalletstatus') result={locked:false,wallet_tip:{height:100,blockhash:v.tipHash},fully_synced_height:100};
 else if(method==='getblock') result=params[0]===v.tipHash?{hash:v.tipHash,height:100,time,confirmations:1,tx:[]}:{hash:v.blockHash,height:90,time:time-750,confirmations:11,tx:[v.txid]};
 else if(method==='getblockhash') result=params[0]===100?v.tipHash:v.blockHash;
 else if(method==='z_viewtransaction') result={txid:v.txid,status:'mined',blockhash:v.blockHash,outputs:[{pool:process.env.TEST_OUTPUT_POOL,action:2,account_uuid:v.account,address:v.receiver,outgoing:false,walletInternal:false,valueZat:Number(process.env.TEST_OUTPUT_VALUE_ZAT),memo:v.memo}]};
 else throw new Error('Unexpected RPC');
 return new Response(JSON.stringify({id:'archive-v1',result}));
};`);
    const env = { ...process.env, ARCHIVE_NETWORK: "mainnet", ARCHIVE_POOL: "ironwood", ARCHIVE_RECEIVER: receiver, ARCHIVE_PUBLIC_VIEWING_KEY: key, ARCHIVE_RECEIVER_INDEX: "0",
      ARCHIVE_BIRTHDAY_HEIGHT: "80", ARCHIVE_ZALLET_VERSION: "0.1.0-beta.3", ARCHIVE_CONFIRMATIONS: "10", ARCHIVE_READER_RPC_URL: "http://127.0.0.1:28248", ARCHIVE_CHAIN_RPC_URL: "http://127.0.0.1:8232",
      ARCHIVE_WRITER_RPC_URL: "", TEST_OUTPUT_POOL: "ironwood", TEST_OUTPUT_VALUE_ZAT: "1" };
    const args = ["--import", preload, resolve("public/verify/archive-verify.mjs"), file, "--hash", checked.manifestHash, "--txid", txid];
    const result = await promisify(execFile)(process.execPath, [...args, "--extract", target], { cwd: folder, env });
    expect(JSON.parse(result.stdout)).toMatchObject({ fileStatus: "MATCHED", chainStatus: "VERIFIED", evidence: { pool: "ironwood", outputIndex: 2 } });
    expect(await readFile(join(target, "manifest.json"), "utf8")).toBe(checked.bundle.manifest);
    await expect(promisify(execFile)(process.execPath, args, { cwd: folder, env: { ...env, TEST_OUTPUT_POOL: "orchard" } })).rejects.toThrow("MEMO_MISMATCH");
    await expect(promisify(execFile)(process.execPath, args, { cwd: folder, env: { ...env, TEST_OUTPUT_VALUE_ZAT: "2" } })).rejects.toThrow("MEMO_MISMATCH");
  } finally { await rm(folder, { recursive: true, force: true }); }
});
