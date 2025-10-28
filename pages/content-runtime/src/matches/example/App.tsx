import { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    console.log('[CEB] Example runtime content view loaded');
    
    // 监听来自popup的消息
    const handleMessage = (message: any, sender: any, sendResponse: any) => {
      if (message.action === 'downloadCSV') {
        const { csvContent, filename } = message;
        
        // 创建CSV文件并下载
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        sendResponse({ success: true });
      }
    };
    
    chrome.runtime.onMessage.addListener(handleMessage);
    
    // 清理函数
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  return <div className="ceb-example-runtime-content-view-text">Example runtime content view</div>;
}
