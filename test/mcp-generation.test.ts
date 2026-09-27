import {expect, it} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {SlipperMcpServer} from '../src/main/mcp-server';

it('exposes preview without a receipt and requires the receipt only at submission', async()=>{
  let previews=0;
  const server=new SlipperMcpServer({currentPage:async()=>({}),pageImages:async()=>[],searchLibrary:async()=>[],submitProposalPlan:async()=>[],submitVariantReview:async()=>[],submitVariant:async()=>[],submitStoryline:async()=>[],submitDeckReading:async()=>[],submitPageReading:async()=>[],previewVariant:async()=>{previews++;return {images:[],problems:[],previewToken:'receipt'};}});
  await server.start();
  const client=new Client({name:'test',version:'1.0'});
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url),{requestInit:{headers:{Authorization:`Bearer ${server.token}`}}}));
    const list=await client.listTools();
    expect(list.tools.find(t=>t.name==='preview_variant')!.inputSchema.required).not.toContain('previewToken');
    expect(list.tools.find(t=>t.name==='submit_variant')!.inputSchema.required).toContain('previewToken');
    const result=await client.callTool({name:'preview_variant',arguments:{requestId:'r',aim:'主張を示す',gaveUp:'詳細',technique:'takahashi',frames:[{elements:[{id:'t',type:'text',text:'結論',x:0,y:0,w:100,h:40,invented:false}]}]}});
    expect(result.isError).not.toBe(true);
    expect(previews).toBe(1);
  } finally {await client.close();server.stop();}
});
