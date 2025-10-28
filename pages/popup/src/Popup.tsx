import '@src/Popup.css';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner } from '@extension/ui';
import { useState, useEffect } from 'react';

const Popup = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // 组件加载时获取当前URL
  useEffect(() => {
    getCurrentUrl();
  }, []);

  // 获取当前页面URL
  const getCurrentUrl = async () => {
    const [tab] = await chrome.tabs.query({ currentWindow: true, active: true });
    setCurrentUrl(tab.url || '');
  };

  // 检查是否为目标页面
  const isTargetPage = () => {
    return currentUrl.includes('vip.stock.finance.sina.com.cn/mkt/#china_us');
  };

  // 将数据转换为CSV格式
  const convertToCSV = (data: any[]) => {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    
    const csvRows = data.map(row => {
      return headers.map(header => {
        const value = row[header] || '';
        // 处理包含逗号的值
        return `"${value.toString().replace(/"/g, '""')}"`;
      }).join(',');
    });
    
    return [csvHeaders, ...csvRows].join('\n');
  };

  // 下载CSV文件
  const downloadCSV = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 获取中概股数据（支持自动分页）
  const getChinaStockData = async () => {
    setIsLoading(true);
    try {
      const [tab] = await chrome.tabs.query({ currentWindow: true, active: true });
      
      // 注入自动分页数据提取脚本
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: async () => {
          // 获取表格数据的函数
          function getTableData() {
            const tableWrapper = document.getElementById('tbl_wrap');
            if (!tableWrapper) {
              console.error('未找到ID为tbl_wrap的表格容器');
              return null;
            }
            
            const table = tableWrapper.querySelector('table');
            if (!table) {
              console.error('在tbl_wrap容器内未找到表格');
              return null;
            }
            
            // 获取表头数据
            const headers = [];
            const headerRow = table.querySelector('thead tr');
            if (headerRow) {
              const headerCells = headerRow.querySelectorAll('th, td');
              headerCells.forEach(cell => {
                const link = cell.querySelector('a');
                headers.push(link ? link.textContent.trim() : cell.textContent.trim());
              });
            }
            
            // 获取表格行数据
            const rows = [];
            const tbody = table.querySelector('tbody');
            if (tbody) {
              const dataRows = tbody.querySelectorAll('tr');
              dataRows.forEach(row => {
                const rowData: any = {};
                const cells = row.querySelectorAll('th, td');
                
                cells.forEach((cell, index) => {
                  if (headers[index]) {
                    const link = cell.querySelector('a');
                    const cellValue = link ? link.textContent.trim() : cell.textContent.trim();
                    rowData[headers[index]] = cellValue;
                  }
                });
                
                rowData.rowClass = row.className;
                rows.push(rowData);
              });
            }
            
            return {
              headers: headers,
              rows: rows,
              totalRows: rows.length
            };
          }
          
          // 检查是否到达最后一页
          function isLastPage() {
            // 查找所有.pageone元素
            const pageoneElements = document.querySelectorAll('#list_pages_top2 .pageone');
            if (pageoneElements.length >= 2) {
              // 最后一个.pageone元素应该是"下一页"按钮
              const nextButton = pageoneElements[pageoneElements.length - 1];
              return nextButton.classList.contains('pagedisabled');
            }
            return false;
          }
          
          // 点击下一页
          function clickNextPage() {
            // 查找所有.pageone元素
            const pageoneElements = document.querySelectorAll('#list_pages_top2 .pageone');
            if (pageoneElements.length >= 2) {
              // 最后一个.pageone元素应该是"下一页"按钮
              const nextButton = pageoneElements[pageoneElements.length - 1];
              if (!nextButton.classList.contains('pagedisabled')) {
                (nextButton as HTMLElement).click();
                return true;
              }
            }
            return false;
          }
          
          // 跳转到第一页
          function goToFirstPage() {
            // 查找所有链接，找到指向第1页的链接
            const allLinks = document.querySelectorAll('#list_pages_top2 a');
            for (let link of allLinks) {
              const text = link.textContent.trim();
              if (text === '1') {
                (link as HTMLElement).click();
                return true;
              }
            }
            return false;
          }
          
          // 等待页面加载
          function waitForPageLoad() {
            return new Promise(resolve => {
              setTimeout(resolve, 2000); // 等待2秒
            });
          }
          
          // 自动分页获取所有数据
          async function getAllData() {
            const allData: any[] = [];
            let currentPage = 1;
            let headers: string[] = [];
            
            // 首先跳转到第一页
            console.log('跳转到第一页...');
            if (goToFirstPage()) {
              await waitForPageLoad();
            } else {
              console.log('无法跳转到第一页，从当前页开始');
            }
            
            while (true) {
              console.log(`正在获取第 ${currentPage} 页数据...`);
              
              // 调试：打印当前分页器状态
              const pageoneElements = document.querySelectorAll('#list_pages_top2 .pageone');
              console.log(`找到 ${pageoneElements.length} 个.pageone元素`);
              pageoneElements.forEach((el, index) => {
                console.log(`元素${index}: ${el.textContent.trim()}, disabled: ${el.classList.contains('pagedisabled')}`);
              });
              
              // 获取当前页数据
              const pageData = getTableData();
              if (pageData && pageData.rows) {
                allData.push(...pageData.rows);
                headers = pageData.headers; // 保存表头信息
                console.log(`第 ${currentPage} 页获取到 ${pageData.rows.length} 条数据`);
              }
              
              // 检查是否到达最后一页
              if (isLastPage()) {
                console.log('已到达最后一页');
                break;
              }
              
              // 点击下一页
              if (!clickNextPage()) {
                console.log('无法点击下一页，可能已到达最后一页');
                break;
              }
              
              // 等待页面加载
              await waitForPageLoad();
              currentPage++;
            }
            
            return {
              headers: headers,
              rows: allData,
              totalRows: allData.length,
              totalPages: currentPage
            };
          }
          
          return getAllData();
        }
      });

      const allData = results[0]?.result;
      
      if (allData && allData.rows && allData.rows.length > 0) {
        const csvContent = convertToCSV(allData.rows);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `china_stocks_all_pages_${timestamp}.csv`;
        
        // 通过消息传递下载文件
        chrome.tabs.sendMessage(tab.id!, {
          action: 'downloadCSV',
          csvContent: csvContent,
          filename: filename
        });
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icon-34.png'),
          title: '数据导出成功',
          message: `成功导出 ${allData.totalRows} 条数据（共 ${allData.totalPages} 页）`
        });
      } else {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icon-34.png'),
          title: '数据获取失败',
          message: '未找到表格数据，请确保页面已完全加载'
        });
      }
    } catch (error) {
      console.error('获取数据失败:', error);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon-34.png'),
        title: '操作失败',
        message: '获取数据时发生错误'
      });
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className={cn('w-80 h-32 flex items-center justify-center', isLight ? 'bg-white' : 'bg-gray-900')}>
      {/* 获取中概股数据按钮 - 只在目标页面显示 */}
      {isTargetPage() ? (
        <button
          className={cn(
            'w-48 h-12 rounded-lg font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 active:scale-95',
            isLight 
              ? 'bg-gradient-to-r from-green-400 to-green-600 text-white hover:from-green-500 hover:to-green-700' 
              : 'bg-gradient-to-r from-green-500 to-green-700 text-white hover:from-green-600 hover:to-green-800',
            isLoading && 'opacity-75 cursor-not-allowed'
          )}
          onClick={getChinaStockData}
          disabled={isLoading}>
          {isLoading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              获取中...
            </div>
          ) : (
            '📊 获取全部数据'
          )}
        </button>
      ) : (
        <div className={cn('text-center', isLight ? 'text-gray-600' : 'text-gray-400')}>
          <p className="text-sm">请在</p>
          <p className="text-xs font-mono">vip.stock.finance.sina.com.cn</p>
          <p className="text-sm">页面使用此功能</p>
        </div>
      )}
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
