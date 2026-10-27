/* Display legacy receipts in English without changing stored order data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MOMO_DISPLAY=api;})(typeof window==='undefined'?{}:window,()=>{
  const names={
  "Ella · 慢慢开口": "Ella · Speak at Your Pace",
  "Noah · 聊聊生活": "Noah · Everyday Conversations",
  "Mia · 开口小计划": "Mia · One Small Speaking Goal",
  "Sam · 轻松说两句": "Sam · A Gentle First Conversation",
  "林老师 · 中文小日常": "Lin · Everyday Chinese",
  "Mei · 用中文聊生活": "Mei · Chinese for Daily Life",
  "陈老师 · 发音慢慢练": "Chen · Pronunciation at Your Pace",
  "An · 第一句中文": "An · Your First Chinese Phrases",
  "把小事写给你": "Our Little Memories",
  "要不要，一起喝杯茶": "Shall We Share Some Tea?",
  "一起做点不完美的小事": "Make Something Imperfect Together",
  "一句话的小信笺": "A Little Note to You",
  "测试课程 / Test lesson": "Test lesson",
  "测试商品或服务 / Test item": "Test item or service",
  "沙箱测试 / Sandbox test": "Sandbox test",
  "服务预约": "Test service",
  "商品购买": "Test product"
};
  const words={'周六':'Saturday','周日':'Sunday','周三':'Wednesday','下周二':'Next Tuesday','简约原色包装':'Simple natural wrapping','附一张空白卡片':'Include a blank note card'};
  function text(value){let s=String(value??'');if(names[s])return names[s];for(const [from,to]of Object.entries(words))s=s.split(from).join(to);return s;}
  return {text};
});
