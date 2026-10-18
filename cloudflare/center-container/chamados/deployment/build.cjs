// Build only the overlay; the live baseline is copied byte-for-byte as a separate ES module.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const value=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const baseline=value('--production-bundle'),out=value('--outdir'),expected=value('--expected-sha256');
async function main(){
 if(!baseline||!out||!expected||!/^[a-f0-9]{64}$/.test(expected))
  throw Error('Required: --production-bundle PATH --expected-sha256 HASH --outdir PATH');
 const source=fs.readFileSync(path.resolve(baseline));
 const actual=crypto.createHash('sha256').update(source).digest('hex');
 if(actual!==expected)throw Error('Production baseline hash differs');
 const esbuild=require(require.resolve('esbuild',{paths:[process.env.CONSTRUTEC_ESBUILD_MODULES||process.cwd()]}));
 const directory=path.resolve(out);fs.mkdirSync(directory,{recursive:true});
 const bundle=path.join(directory,'index.mjs');
 const result=await esbuild.build({entryPoints:[path.join(__dirname,'entry.js')],outfile:bundle,
  bundle:true,format:'esm',platform:'browser',target:'es2022',minifyWhitespace:true,
  external:['./preserved-production.mjs','cloudflare:*','node:*'],metafile:true,logLevel:'warning'});
 const baselineName='preserved-production.mjs';
 fs.writeFileSync(path.join(directory,baselineName),source);
 const files=['index.mjs',baselineName].map(name=>{
  const bytes=fs.readFileSync(path.join(directory,name));
  return {name,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 });
 const manifest={createdAt:new Date().toISOString(),baseline:actual,files,
  overlayInputs:Object.keys(result.metafile.inputs),exports:['default','CentroCustosApi']};
 fs.writeFileSync(path.join(directory,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({ok:true,files,baselineUnchanged:files[1].sha256===actual},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
