const isLoon = typeof $persistentStore !== "undefined";
const isQuanX = typeof $prefs !== "undefined";
const isSurge = !isLoon && !isQuanX;

const PROJ_LIST_KEY = "MockBox_Projects_List";
const PROJ_CURR_KEY = "MockBox_Active_Proj";

// 本地存储
const storage = {
    get: key => {
        let value = null;
        if (isLoon || isSurge) value = $persistentStore.read(key);
        if (isQuanX) value = $prefs.valueForKey(key);
        if (!value) return null;
        try { return JSON.parse(value); } catch (e) { return value; }
    },
    set: (key, val) => {
        let toStore = (typeof val === "object" && val !== null) ? JSON.stringify(val) : String(val);
        if (isLoon || isSurge) return $persistentStore.write(toStore, key);
        if (isQuanX) return $prefs.setValueForKey(toStore, key);
    },
    remove: key => {
        if (isLoon || isSurge) $persistentStore.write(null, key);
        if (isQuanX) $prefs.removeValueForKey(key);
    }
};

// 获取项目键值
function getProjKeys(projName) {
    if (!projName) return { indexKey: null, dataPrefix: null };
    let safeName = encodeURIComponent(projName).replace(/%/g, '_');
    return {
        indexKey: `MB_Idx_${safeName}`,
        dataPrefix: `MB_Data_${safeName}_`
    };
}

// 模拟响应
function mockResponse(bodyStr, contentType = "application/json") {
    return {
        status: "HTTP/1.1 200 OK",
        headers: {
            "Content-Type": contentType,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Cache-Control": "no-cache"
        },
        body: bodyStr
    };
}

// 获取安全请求体
function getSafeBody() {
    if (typeof $request === "undefined" || !$request.body) return {};
    try {
        if (typeof $request.body === "object") return $request.body;
        return JSON.parse($request.body);
    } catch (e) {
        return {};
    }
}


// 请求拦截与路由转发
const url = typeof $request !== "undefined" ? $request.url : "";
const isReq = typeof $response === "undefined";
const isDashboard = url.includes("www.mock.com");

// 路由映射
const API_ROUTES = {
    // 获取项目信息
    "/api/project/info": () => {
        return mockResponse(JSON.stringify({
            list: storage.get(PROJ_LIST_KEY) || [],
            current: storage.get(PROJ_CURR_KEY) || ""
        }));
    },
    // 添加项目
    "/api/project/add": () => {
        let body = getSafeBody();
        if (!body.name) return mockResponse(JSON.stringify({ success: false, msg: "名称不能为空" }));
        let list = storage.get(PROJ_LIST_KEY) || [];
        if (!list.includes(body.name)) {
            list.push(body.name);
            storage.set(PROJ_LIST_KEY, list);
        }
        storage.set(PROJ_CURR_KEY, body.name);
        return mockResponse(JSON.stringify({ success: true }));
    },
    // 切换项目
    "/api/project/switch": () => {
        let body = getSafeBody();
        storage.set(PROJ_CURR_KEY, body.name);
        return mockResponse(JSON.stringify({ success: true }));
    },
    // 删除项目
    "/api/project/delete": () => {
        let body = getSafeBody();
        let name = body.name;
        let list = storage.get(PROJ_LIST_KEY) || [];
        list = list.filter(n => n !== name);
        storage.set(PROJ_LIST_KEY, list);
        if (storage.get(PROJ_CURR_KEY) === name) {
            storage.set(PROJ_CURR_KEY, list.length > 0 ? list[0] : "");
        }
        let keys = getProjKeys(name);
        let idx = storage.get(keys.indexKey) || [];
        idx.forEach(p => storage.remove(keys.dataPrefix + p));
        storage.remove(keys.indexKey);
        return mockResponse(JSON.stringify({ success: true }));
    },
    // 获取API列表
    "/api/list": () => {
        let curr = storage.get(PROJ_CURR_KEY);
        if (!curr) return mockResponse(JSON.stringify([]));
        let keys = getProjKeys(curr);
        let index = storage.get(keys.indexKey) || [];
        let listInfo = index.map(p => {
            let d = storage.get(keys.dataPrefix + p) || {};
            return {
                path: p,
                enabled: !!d.enabled,
                hasOriginal: !!d.originalData,
                updateTime: d.updateTime || 0
            };
        });
        return mockResponse(JSON.stringify(listInfo));
    },
    // 获取API详情
    "/api/detail": () => {
        let curr = storage.get(PROJ_CURR_KEY);
        if (!curr) return mockResponse(JSON.stringify({}));
        let keys = getProjKeys(curr);
        let path = decodeURIComponent(url.split("path=")[1] || "");
        let d = storage.get(keys.dataPrefix + path) || { enabled: false, originalData: null, mockData: null, updateTime: 0 };
        return mockResponse(JSON.stringify(d));
    },
    // 添加API
    "/api/add": () => {
        let curr = storage.get(PROJ_CURR_KEY);
        if (!curr) return mockResponse(JSON.stringify({ success: false, msg: "未选择项目" }));
        let keys = getProjKeys(curr);
        let body = getSafeBody();
        if (body.path) {
            let idx = storage.get(keys.indexKey) || [];
            if (!idx.includes(body.path)) {
                idx.push(body.path);
                storage.set(keys.indexKey, idx);
                storage.set(keys.dataPrefix + body.path, {
                    storageKey: keys.dataPrefix + body.path,
                    path: body.path,
                    enabled: false,
                    originalData: null,
                    mockData: null,
                    updateTime: Date.now()
                });
            }
            return mockResponse(JSON.stringify({ success: true }));
        }
        return mockResponse(JSON.stringify({ success: false, msg: "解析参数失败" }));
    },
    // 删除API
    "/api/delete": () => {
        let curr = storage.get(PROJ_CURR_KEY);
        if (!curr) return mockResponse(JSON.stringify({ success: false }));
        let keys = getProjKeys(curr);
        let body = getSafeBody();
        if (body.path) {
            let idx = storage.get(keys.indexKey) || [];
            idx = idx.filter(p => p !== body.path);
            storage.set(keys.indexKey, idx);
            storage.remove(keys.dataPrefix + body.path);
        }
        return mockResponse(JSON.stringify({ success: true }));
    },
    // 保存API
    "/api/save": () => {
        let curr = storage.get(PROJ_CURR_KEY);
        if (!curr) return mockResponse(JSON.stringify({ success: false, msg: "未选择项目" }));
        let keys = getProjKeys(curr);
        let body = getSafeBody();
        if (body.path) {
            storage.set(keys.dataPrefix + body.path, {
                storageKey: keys.dataPrefix + body.path,
                path: body.path,
                enabled: body.enabled,
                originalData: body.originalData,
                mockData: body.mockData,
                updateTime: Date.now()
            });
            return mockResponse(JSON.stringify({ success: true }));
        }
        return mockResponse(JSON.stringify({ success: false, msg: "数据格式异常" }));
    },
    // 获取本地存储键值
    "/api/sys/storage": () => {
        let list = storage.get(PROJ_LIST_KEY) || [];
        let allKeys = [PROJ_LIST_KEY, PROJ_CURR_KEY];
        list.forEach(proj => {
            let k = getProjKeys(proj);
            allKeys.push(k.indexKey);
            let idx = storage.get(k.indexKey) || [];
            idx.forEach(p => allKeys.push(k.dataPrefix + p));
        });

        let overview = {
            "当前活跃项目": storage.get(PROJ_CURR_KEY) || "无",
            "工作区项目数": list.length,
            "总系统底层键数": allKeys.length,
            "底层存储映射键列表": allKeys
        };
        return mockResponse(JSON.stringify(overview));
    }
};

// 请求处理
if (isDashboard) {
    if ($request.method === "OPTIONS") {
        $done(mockResponse(""));
    } else {
        let matchedRoute = Object.keys(API_ROUTES).find(route => url.includes(route));
        if (matchedRoute) {
            $done(API_ROUTES[matchedRoute]());
        } else {
            $done(mockResponse(getHtml(), "text/html;charset=utf-8"));
        }
    }
}

//  真实业务 API 拦截与注入
let currentActiveProject = storage.get(PROJ_CURR_KEY);
if (!isReq && !isDashboard && currentActiveProject) {
    let keys = getProjKeys(currentActiveProject);
    const apiPath = url.split('?')[0];
    let index = storage.get(keys.indexKey) || [];
    let matchedKey = index.find(k => apiPath.includes(k));

    if (matchedKey) {
        let apiConfig = storage.get(keys.dataPrefix + matchedKey) || {};

        if (apiConfig.enabled && apiConfig.mockData) {
            let bodyStr = typeof apiConfig.mockData === 'object' ? JSON.stringify(apiConfig.mockData) : apiConfig.mockData;
            $done({ body: bodyStr });
        } else {
            try {
                let realBody = JSON.parse($response.body);
                apiConfig.originalData = realBody;
                if (!apiConfig.mockData) apiConfig.mockData = realBody;

                apiConfig.updateTime = Date.now();
                storage.set(keys.dataPrefix + matchedKey, apiConfig);
            } catch (e) { }
            $done({});
        }
    } else {
        $done({});
    }
} else if (!isDashboard) {
    $done({});
}

// HTML前端页面？？？？名芳名芳名芳名芳名芳名芳名芳名芳是pig
function getHtml() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="QuanMock">
    <meta name="theme-color" content="#f9fafb">
    
    <link rel="icon" type="image/jpeg" href="https://raw.githubusercontent.com/ByteSheepStudio/QuanMock/main/QuanMock/static/img/logo.jpg">
<link rel="apple-touch-icon" href="https://raw.githubusercontent.com/ByteSheepStudio/QuanMock/main/QuanMock/static/img/logo.jpg">
    
    <title>QuanMock 工作台</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/jsoneditor/9.10.0/jsoneditor.min.css" rel="stylesheet" type="text/css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jsoneditor/9.10.0/jsoneditor.min.js"></script>
    <link rel="stylesheet" href="https://at.alicdn.com/t/c/font_5130911_qo20l0um48i.css">
    
    <style>
        html, body { height: 100%; height: 100dvh; margin: 0; padding: 0; overflow: hidden; background-color: #f3f4f6; }
        @supports (-webkit-touch-callout: none) { html, body { height: -webkit-fill-available; } }
        
        /* 基础 JSON Editor 样式覆盖 */
        .jsoneditor { border: 1px solid #e5e7eb !important; border-radius: 0.5rem; overflow: hidden; }
        .jsoneditor-menu { background-color: #4f46e5 !important; border-bottom: none !important; padding: 2px; }
        .jsoneditor-poweredBy { display: none !important; }
        .jsoneditor-search input { background: rgba(255,255,255,0.2); border: none; color: white; border-radius: 4px; padding: 2px 8px; transition: all 0.3s ease; }
        .jsoneditor-search input::placeholder { color: rgba(255,255,255,0.7); }
        
        /* === 修复 1:手机端搜索框过宽遮挡左侧切换按钮 === */
        @media (max-width: 640px) {
            .jsoneditor-search { width: auto !important; }
            /* 默认缩窄搜索框给切换按钮腾出空间 */
            .jsoneditor-search input { width: 50px !important; }
            /* 点击聚焦时平滑拉长并提亮，方便看清输入的搜索词 */
            .jsoneditor-search input:focus { width: 140px !important; background: rgba(255,255,255,0.95); color: #374151; position: relative; z-index: 10; }
            .jsoneditor-search input:focus::placeholder { color: #9ca3af; }
        }

        /* === 修复 2:彻底重写电脑端切换模式下拉菜单的颜色（解决蓝底灰字问题） === */
        .jsoneditor-contextmenu .jsoneditor-menu { 
            background-color: #ffffff !important; 
            border-radius: 0.5rem !important; 
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important; 
            padding: 4px !important; 
            border: 1px solid #f3f4f6 !important;
        }
        .jsoneditor-contextmenu .jsoneditor-menu button { 
            color: #4b5563 !important; /* 默认灰黑色 */
            border-radius: 0.375rem !important; 
            transition: all 0.2s; 
            margin-bottom: 2px; 
            font-weight: 500;
        }
        .jsoneditor-contextmenu .jsoneditor-menu button:hover, 
        .jsoneditor-contextmenu .jsoneditor-menu button:focus { 
            background-color: #f3f4f6 !important; /* 悬浮浅灰色底 */
            color: #4f46e5 !important; /* 悬浮主题色字 */
        }
        /* 强制纠正选中态，替换原本的刺眼配置 */
        .jsoneditor-contextmenu .jsoneditor-menu button.jsoneditor-selected,
        .jsoneditor-contextmenu .jsoneditor-menu button.jsoneditor-selected:hover { 
            background-color: #4f46e5 !important; /* 主题靛蓝底 */
            color: #ffffff !important; /* 纯白字 */
            font-weight: bold; 
        }
        .jsoneditor-frame{border-radius: 0.5rem !important;}

        /* 滚动条与其他全局美化 */
        .sidebar-scroll::-webkit-scrollbar { width: 4px; }
        .sidebar-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
        .custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 3px; }
        
        .safe-pt { padding-top: max(env(safe-area-inset-top), 12px) !important; }
        .safe-pb { padding-bottom: max(env(safe-area-inset-bottom), 16px) !important; }
        .safe-pl { padding-left: max(env(safe-area-inset-left), 0px); }
        .safe-pr { padding-right: max(env(safe-area-inset-right), 0px); }

        .glass-effect { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
    </style>
</head>
<body class="flex overflow-hidden font-sans relative safe-pl safe-pr text-gray-800">

    <div id="toast" class="fixed top-5 left-1/2 transform -translate-x-1/2 z-[100] transition-all duration-300 opacity-0 pointer-events-none -translate-y-5">
        <div id="toastContent" class="bg-gray-800 text-white px-5 py-2.5 rounded-xl shadow-2xl text-sm flex items-center font-medium"></div>
    </div>

    <div id="sidebar" class="bg-white md:border-r border-gray-200 flex flex-col flex-shrink-0 z-30 shadow-2xl md:shadow-none absolute md:relative h-full transition-all duration-300 transform -translate-x-full md:translate-x-0 w-[80vw] md:w-80 overflow-hidden">
        <div class="w-[80vw] md:w-80 flex flex-col h-full bg-gray-50/50">
            <div class="px-5 pb-4 pt-4 border-b border-gray-200 bg-white flex flex-col safe-pt gap-4 flex-shrink-0 shadow-sm z-10">
                <h1 class="text-lg font-extrabold text-gray-900 flex items-center tracking-tight">
                    <img src="https://raw.githubusercontent.com/ByteSheepStudio/QuanMock/main/QuanMock/static/img/logo.jpg" class="w-8 h-8 rounded-lg mr-2.5 shadow-sm" alt="Logo">
                    QuanMock
                </h1>
                
                <div class="flex gap-2 items-center w-full relative" id="projectSelectContainer">
                    <button id="customSelectBtn" onclick="App.UI.toggleProjectDropdown(event)" class="flex-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 font-medium text-sm rounded-lg p-2.5 flex justify-between items-center h-10 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all text-left">
                        <span id="customSelectText" class="truncate pr-2 select-none">加载中...</span>
                        <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    <ul id="customSelectList" class="absolute z-[60] left-0 right-0 top-full mt-2 bg-white border border-gray-100 rounded-xl shadow-xl max-h-56 overflow-y-auto hidden py-1 custom-scroll"></ul>
                    
                    <button onclick="App.UI.openCreateProjModal()" class="flex-shrink-0 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 bg-white border border-gray-200 rounded-lg p-2 transition-all flex items-center justify-center w-10 h-10 shadow-sm" title="新建项目">
                        <i class="iconfont icon-tianjia font-bold"></i>
                    </button>
                    <button id="delProjBtn" onclick="App.Core.deleteProject()" class="flex-shrink-0 text-gray-500 hover:text-red-500 hover:bg-red-50 bg-white border border-gray-200 rounded-lg p-2 transition-all flex items-center justify-center w-10 h-10 shadow-sm" title="删除当前项目">
                        <i class="iconfont icon-shanchu font-bold"></i>
                    </button>
                </div>
            </div>
            
            <div class="p-4 border-b border-gray-200 bg-white flex-shrink-0">
                <div class="flex shadow-sm rounded-lg overflow-hidden border border-gray-200 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-400 transition-all bg-gray-50">
                    <input type="text" id="newApiInput" placeholder="输入需拦截的 API 路径..." class="flex-1 bg-transparent text-gray-700 text-sm p-3 outline-none border-none disabled:cursor-not-allowed">
                    <button id="addApiBtn" onclick="App.Core.addApi()" class="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-700 font-semibold text-sm px-5 transition-colors disabled:bg-gray-100 disabled:text-gray-400 flex items-center border-l border-gray-200">
                        添加
                    </button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto sidebar-scroll p-3 safe-pb relative min-h-0 space-y-2" id="apiList"></div>
        </div>
    </div>

    <div id="mobileOverlay" onclick="App.UI.toggleSidebar()" class="fixed inset-0 bg-gray-900 bg-opacity-50 backdrop-blur-sm z-20 hidden md:hidden transition-opacity"></div>

    <div class="flex-1 flex flex-col bg-gray-100 h-full min-w-0 overflow-hidden relative">
        
        <div id="headerArea" class="px-4 md:px-6 py-3 border-b border-gray-200 bg-white flex justify-between items-center shadow-sm z-10 flex-shrink-0 safe-pt">
            <div class="flex-1 min-w-0 pr-4 flex items-center">
                <button onclick="App.UI.toggleSidebar()" class="mr-3 text-gray-400 hover:text-indigo-600 bg-gray-50 hover:bg-indigo-50 p-2 rounded-lg focus:outline-none flex-shrink-0 transition-colors flex items-center justify-center">
                    <i class="iconfont icon-ego-menu text-xl"></i>
                </button>
                <div class="flex flex-col min-w-0">
                    <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">当前拦截路径</span>
                    <div id="currentApiDisplay" class="text-sm font-mono text-gray-700 flex-1 min-w-0 cursor-pointer hover:text-indigo-600 transition-colors truncate" onclick="App.UI.openFullApiModal()" title="点击查看完整路径">-</div>
                </div>
            </div>
            
            <div class="flex items-center gap-3 flex-shrink-0">
                <div class="relative flex items-center justify-center" id="actionMenuContainer">
                    <button id="actionMenuBtn" disabled onclick="App.UI.toggleActionMenu(event)" class="text-gray-500 hover:text-indigo-600 focus:outline-none transition-colors disabled:text-gray-300 disabled:cursor-not-allowed p-1 flex items-center justify-center rounded-lg hover:bg-indigo-50 w-9 h-9" title="操作选项">
                        <i class="iconfont icon-banshou text-2xl leading-none"></i>
                    </button>
                    <div id="actionMenuList" class="absolute z-[60] right-0 top-full mt-2 w-52 bg-white border border-gray-100 rounded-xl shadow-2xl hidden flex-col py-2 overflow-hidden transform origin-top-right transition-all">
                        <div class="px-5 py-3 flex justify-between items-center border-b border-gray-50 bg-gray-50/50">
                            <span class="text-sm font-bold text-gray-700">开启 Mock 拦截</span>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" id="mockToggle" class="sr-only peer" onchange="App.Core.saveApiData()">
                                <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500 shadow-inner"></div>
                            </label>
                        </div>
                        <button onclick="App.Core.syncLeftToRight(); App.UI.toggleActionMenu(event);" class="px-5 py-3 text-left text-sm font-medium text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center w-full group">
                            <i class="iconfont icon-xunhuan1 mr-3 text-gray-400 group-hover:text-indigo-500"></i> 同步原始响应至 Mock
                        </button>
                        <button onclick="App.Core.saveApiData(); App.UI.toggleActionMenu(event);" class="px-5 py-3 text-left text-sm font-medium text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center w-full group">
                            <svg class="w-4 h-4 mr-3 text-gray-400 group-hover:text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> 
                            保存当前所有修改
                        </button>
                    </div>
                </div>

                <div class="h-6 w-px bg-gray-200 mx-1"></div>

                <a href="https://github.com/SheepFJ/" target="_blank" class="text-gray-400 hover:text-gray-800 transition-colors hover:bg-gray-200 p-2 rounded-lg flex items-center justify-center" title="GitHub">
                    <i class="iconfont icon-github-fill text-xl"></i>
                </a>
                <button onclick="App.UI.openToolbox()" class="text-gray-400 hover:text-indigo-600 transition-colors hover:bg-indigo-50 p-2 rounded-lg flex items-center justify-center" title="开发者工具箱">
                    <i class="iconfont icon-lujing text-xl"></i>
                </button>
            </div>
        </div>

        <div class="flex-1 relative w-full h-full min-h-0">
            <div id="workspaceContainer" class="flex flex-col md:flex-row gap-3 md:gap-4 p-3 md:p-4 w-full safe-pb overflow-hidden box-border hidden h-full">
                
                <div id="editorPanelOriginal" class="flex flex-col transition-all duration-300">
                    <div class="flex justify-between items-center mb-2 px-1 flex-shrink-0">
                        <span class="text-sm font-bold text-gray-600 flex items-center tracking-wide">
                            <span class="w-2.5 h-2.5 rounded-full bg-blue-400 mr-2 shadow-sm"></span>真实响应数据
                        </span>
                        <button onclick="App.UI.toggleEditorExpand('original')" class="text-gray-400 hover:text-indigo-600 p-1 bg-white rounded-md shadow-sm border border-gray-200 flex items-center justify-center transition-colors" title="展开/收起">
                            <svg id="icon-expand-original" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                        </button>
                    </div>
                    <div class="flex-1 relative w-full bg-white rounded-xl shadow-sm overflow-hidden min-h-[50px]">
                        <div id="editorOriginal" class="absolute inset-0"></div>
                    </div>
                </div>

                <div id="editorPanelMock" class="flex flex-col transition-all duration-300">
                    <div class="flex justify-between items-center mb-2 px-1 flex-shrink-0">
                        <span class="text-sm font-bold text-indigo-700 flex items-center tracking-wide">
                            <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 mr-2 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>Mock 伪造数据
                        </span>
                        <button onclick="App.UI.toggleEditorExpand('mock')" class="text-gray-400 hover:text-indigo-600 p-1 bg-white rounded-md shadow-sm border border-gray-200 flex items-center justify-center transition-colors" title="展开/收起">
                            <svg id="icon-expand-mock" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                        </button>
                    </div>
                    <div class="flex-1 relative w-full bg-white rounded-xl shadow-sm overflow-hidden min-h-[50px] ring-1 ring-indigo-100">
                        <div id="editorMock" class="absolute inset-0"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="fullApiModal" class="fixed inset-0 z-[70] hidden flex items-center justify-center">
        <div class="absolute inset-0 bg-gray-900 bg-opacity-40 transition-opacity backdrop-blur-sm" onclick="App.UI.closeFullApiModal()"></div>
        <div class="bg-white rounded-2xl shadow-2xl w-[90%] md:w-[500px] relative z-10 p-6 transform transition-all safe-pt safe-pb">
            <h3 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <i class="iconfont icon-daima text-indigo-500 mr-2"></i>完整 API 路径
            </h3>
            <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm font-mono text-indigo-600 break-all select-all max-h-[40dvh] overflow-y-auto custom-scroll shadow-inner" id="fullApiText"></div>
            <div class="flex justify-end gap-3 mt-6">
                <button onclick="App.UI.closeFullApiModal()" class="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 rounded-lg transition-colors">关闭</button>
                <button onclick="App.Core.copyText('fullApiText', '完整路径')" class="px-5 py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md hover:shadow-lg transition-all flex items-center"><i class="iconfont icon-tijiao mr-2 text-xs"></i> 复制路径</button>
            </div>
        </div>
    </div>

    <div id="createProjModal" class="fixed inset-0 z-[60] hidden flex items-center justify-center">
        <div class="absolute inset-0 bg-gray-900 bg-opacity-40 transition-opacity backdrop-blur-sm" onclick="App.UI.closeCreateProjModal()"></div>
        <div class="bg-white rounded-2xl shadow-2xl w-[90%] md:w-96 relative z-10 p-6 transform transition-all">
            <h3 class="text-lg font-bold text-gray-800 mb-5 flex items-center">
                <i class="iconfont icon-tianjia text-indigo-500 mr-2"></i>创建新项目
            </h3>
            <input type="text" id="projNameInput" class="w-full border border-gray-300 rounded-xl p-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all mb-6 bg-gray-50 focus:bg-white" placeholder="例如:公司核心业务线, 测试环境">
            <div class="flex justify-end gap-3">
                <button onclick="App.UI.closeCreateProjModal()" class="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 rounded-lg transition-colors">取消</button>
                <button onclick="App.Core.submitCreateProj()" class="px-5 py-2.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md hover:shadow-lg transition-all">确认创建</button>
            </div>
        </div>
    </div>

    <div id="confirmModal" class="fixed inset-0 z-[60] hidden flex items-center justify-center">
        <div class="absolute inset-0 bg-gray-900 bg-opacity-40 transition-opacity backdrop-blur-sm" onclick="App.UI.closeConfirmModal()"></div>
        <div class="bg-white rounded-2xl shadow-2xl w-[90%] md:w-96 relative z-10 p-6 transform transition-all">
            <h3 class="text-lg font-bold text-gray-800 mb-3 flex items-center" id="confirmTitle">提示</h3>
            <p class="text-sm text-gray-600 mb-6 leading-relaxed" id="confirmMsg"></p>
            <div class="flex justify-end gap-3">
                <button onclick="App.UI.closeConfirmModal()" class="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 rounded-lg transition-colors">取消</button>
                <button id="confirmOkBtn" class="px-5 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-md hover:shadow-lg transition-all">确认操作</button>
            </div>
        </div>
    </div>

    <div id="toolboxModal" class="fixed inset-0 z-50 hidden">
        <div class="absolute inset-0 bg-gray-900 bg-opacity-40 transition-opacity backdrop-blur-sm" onclick="App.UI.closeToolbox()"></div>
        <div class="absolute inset-0 md:inset-auto md:top-1/2 md:left-1/2 md:transform md:-translate-x-1/2 md:-translate-y-1/2 md:w-[650px] md:h-[75dvh] bg-white md:rounded-2xl shadow-2xl flex flex-col transition-all safe-pt safe-pb overflow-hidden">
            
            <div class="flex justify-between items-center p-5 border-b border-gray-100 flex-shrink-0 bg-gray-50/50">
                <h2 class="text-lg font-bold text-gray-800 flex items-center">
                    <i class="iconfont icon-lujing text-indigo-500 mr-2 text-xl"></i>
                    开发者极客工具箱
                </h2>
                <button onclick="App.UI.closeToolbox()" class="text-gray-400 hover:text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center transition-all shadow-sm">
                    <span class="font-bold leading-none -mt-0.5">&times;</span>
                </button>
            </div>
            
            <div class="flex border-b border-gray-100 flex-shrink-0 bg-white">
                <button id="tabBtn-help" onclick="App.UI.switchTab('help')" class="flex-1 py-3.5 text-sm font-bold border-b-2 border-indigo-600 text-indigo-600 transition-colors">使用引导</button>
                <button id="tabBtn-regex" onclick="App.UI.switchTab('regex')" class="flex-1 py-3.5 text-sm font-bold border-b-2 border-transparent text-gray-500 hover:text-gray-800 transition-colors">正则提取器</button>
                <button id="tabBtn-storage" onclick="App.UI.switchTab('storage')" class="flex-1 py-3.5 text-sm font-bold border-b-2 border-transparent text-gray-500 hover:text-gray-800 transition-colors">底层存储透视</button>
            </div>
            
            <div class="flex-1 overflow-y-auto bg-gray-50 custom-scroll relative">
                <div id="tab-help" class="p-6 text-sm text-gray-700 space-y-4">
                    <ul class="space-y-4">
                        <li class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                            <span class="block font-bold text-indigo-600 mb-1.5 flex items-center"><span class="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-2"></span>第一步:构建项目</span>
                            <span class="text-xs text-gray-500 leading-relaxed">创建一个项目，在该项目下添加其 API 接口路径信息。查看 B 站 <a href="https://www.bilibili.com/video/BV1D34y1q7Vw" target="_blank" class="text-blue-500 hover:underline">拦截教程视频</a> 了解如何在客户端内配置。</span>
                        </li>
                        <li class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                            <span class="block font-bold text-indigo-600 mb-1.5 flex items-center"><span class="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-2"></span>第二步:开启拦截</span>
                            <span class="text-xs text-gray-500 leading-relaxed">在顶部"操作选项"中开启拦截。开启后，对应的真实请求将被拦截并返回 Mock 编辑器中的数据。（注意:此时左侧原始响应面板不再更新）。</span>
                        </li>
                        <li class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                            <span class="block font-bold text-indigo-600 mb-1.5 flex items-center"><span class="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-2"></span>第三步:数据加工</span>
                            <span class="text-xs text-gray-500 leading-relaxed">使用「同步原始响应至 Mock」将真实抓包数据一键覆盖过来，随后随意修改以满足前端测试需求。</span>
                        </li>
                    </ul>
                </div>
                
                <div id="tab-regex" class="hidden p-6 h-full flex flex-col space-y-5">
                    <div class="bg-indigo-50/80 border border-indigo-100 p-4 rounded-xl text-indigo-800 shadow-sm">
                        <p class="font-bold mb-1.5 text-sm flex items-center"><i class="iconfont icon-xunhuan1 mr-2 text-indigo-600"></i> 智能链接拆解引擎</p>
                        <p class="text-xs text-indigo-600/80">贴入完整的 URL，即可精准提取 Host 域名并生成适配各种代理软件的转义正则。</p>
                    </div>
                    
                    <div>
                        <label class="text-xs font-bold text-gray-700 block mb-2 uppercase tracking-wide">输入接口完整 URL 或 路径</label>
                        <input type="text" id="regexInput" class="w-full border border-gray-300 rounded-xl p-3 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all bg-white shadow-sm" placeholder="例如: https://mock.com/api/v1 或者 /api/v1" oninput="App.Core.generateRegex()">
                    </div>
                    
                    <div class="pt-2">
                        <label class="text-xs font-bold text-emerald-600 block mb-2 uppercase tracking-wide">解析的 Host 域名</label>
                        <div class="relative">
                            <input type="text" id="hostOutput" readonly class="w-full bg-emerald-50/50 border border-emerald-200 rounded-xl p-3 pr-20 text-sm font-mono text-emerald-700 outline-none shadow-inner" placeholder="等待输入提取...">
                            <button onclick="App.Core.copyText('hostOutput', 'Host 域名')" class="absolute right-2 top-1/2 transform -translate-y-1/2 bg-white border border-emerald-200 hover:border-emerald-400 hover:text-emerald-700 text-emerald-600 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all">复制</button>
                        </div>
                    </div>
                    
                    <div class="pt-2">
                        <label class="text-xs font-bold text-gray-700 block mb-2 uppercase tracking-wide">生成结果 (圈X专属正则)</label>
                        <div class="relative">
                            <textarea id="regexOutput" readonly class="w-full bg-indigo-50/50 border border-indigo-200 rounded-xl p-3 pr-20 text-sm font-mono text-indigo-700 outline-none resize-none h-24 shadow-inner break-all" placeholder="等待输入生成..."></textarea>
                            <button onclick="App.Core.copyText('regexOutput', '正则规则')" class="absolute right-2 bottom-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md hover:shadow-lg transition-all">复制</button>
                        </div>
                    </div>
                </div>

                <div id="tab-storage" class="hidden p-6 h-full flex flex-col">
                    <p class="text-xs text-gray-500 mb-3 flex items-center font-medium">
                        <i class="iconfont icon-daima text-emerald-500 mr-1.5 text-base"></i> 显示代理软件本地存储的所有项目映射键...
                    </p>
                    <div class="flex-1 bg-gray-900 rounded-xl p-4 overflow-auto custom-scroll border border-gray-800 shadow-inner relative">
                        <pre id="storageContent" class="text-[12px] font-mono text-green-400 whitespace-pre-wrap word-break leading-relaxed">加载中...</pre>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const App = {
            State: {
                apiList: [],
                projectList: [],
                currentProject: "",
                currentApi: null,
                saveTimeoutId: null,
                confirmCallback: null,
                originalEditor: null,
                mockEditor: null,
                API_BASE: "https://www.mock.com",
                editorExpandState: localStorage.getItem('MockBox_Expand_State') || 'split'
            },

            init: function() {
                const editorOptions = { mode: 'tree', modes: ['code', 'tree', 'view'], search: true };
                this.State.originalEditor = new JSONEditor(document.getElementById("editorOriginal"), editorOptions);
                this.State.mockEditor = new JSONEditor(document.getElementById("editorMock"), editorOptions);

                window.addEventListener('resize', () => {
                    if(this.State.resizeTimer) clearTimeout(this.State.resizeTimer);
                    this.State.resizeTimer = setTimeout(() => this.UI.adjustEditorHeight(), 150);
                });

                document.addEventListener('click', (e) => this.UI.handleGlobalClick(e));

                this.UI.applyEditorExpandState(); 
                this.Core.fetchProjects();
            },

            API: {
                post: async function(endpoint, data) {
                    const res = await fetch(App.State.API_BASE + endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    return res.json();
                },
                get: async function(endpoint) {
                    const res = await fetch(App.State.API_BASE + endpoint);
                    return res.json();
                }
            },

            Core: {
                fetchProjects: async function() {
                    try {
                        const data = await App.API.get('/api/project/info');
                        App.State.projectList = data.list;
                        App.State.currentProject = data.current;
                        App.UI.renderProjectSelect();
                        
                        if (App.State.projectList.length === 0) {
                            App.UI.setNoProjectState();
                        } else {
                            App.UI.enableWorkspace();
                            await this.fetchList();
                        }
                    } catch (err) {}
                },
                
                submitCreateProj: async function() {
                    const name = document.getElementById('projNameInput').value.trim();
                    if (!name) return App.UI.showToast("项目名称不能为空", "error");
                    if (App.State.projectList.includes(name)) return App.UI.showToast("该项目名已存在", "error");
                    
                    const res = await App.API.post('/api/project/add', { name: name });
                    if (res.success) {
                        App.UI.showToast("项目创建成功", "success");
                        App.UI.closeCreateProjModal();
                        await this.fetchProjects();
                    }
                },

                switchProject: async function(name) {
                    if(!name) return;
                    await App.API.post('/api/project/switch', { name });
                    App.State.currentProject = name;
                    App.State.currentApi = null;
                    App.UI.renderProjectSelect(); 
                    document.getElementById('workspaceContainer').style.display = 'none';
                    document.getElementById('currentApiDisplay').innerText = "-";
                    document.getElementById('actionMenuBtn').disabled = true;
                    await this.fetchList();
                },

                deleteProject: function() {
                    if (!App.State.currentProject) return;
                    App.UI.showConfirm(
                        "危险操作警报", 
                        \`确定要永久删除项目【\${App.State.currentProject}】以及里面所有的 API 和 Mock 数据吗？此操作不可逆！\`,
                        async () => {
                            await App.API.post('/api/project/delete', { name: App.State.currentProject });
                            App.UI.showToast("项目已成功删除", "success");
                            await this.fetchProjects();
                        }
                    );
                },

                fetchList: async function() {
                    try {
                        const data = await App.API.get('/api/list');
                        App.State.apiList = data;
                        App.UI.renderApiList();

                        if (App.State.apiList.length > 0 && !App.State.currentApi) {
                            this.selectApi(App.State.apiList[0].path);
                        }
                    } catch (err) {}
                },

                selectApi: async function(path) {
                    App.State.currentApi = path;
                    document.getElementById('workspaceContainer').style.display = 'flex';
                    document.getElementById('currentApiDisplay').innerText = path;
                    document.getElementById('actionMenuBtn').disabled = false;
                    
                    setTimeout(() => App.UI.adjustEditorHeight(), 50);

                    if (window.innerWidth < 768) {
                        const sb = document.getElementById('sidebar');
                        if (!sb.classList.contains('-translate-x-full')) App.UI.toggleSidebar(); 
                    }
                    
                    const detail = await App.API.get('/api/detail?path=' + encodeURIComponent(path));
                    document.getElementById('mockToggle').checked = detail.enabled;
                    
                    const oriData = detail.originalData || { "msg": "等待前端触发真实请求来捕获..." };
                    const mckData = detail.mockData || oriData;
                    
                    App.State.originalEditor.set(oriData);
                    App.State.mockEditor.set(mckData);
                    
                    App.UI.renderApiList(); 
                },

                addApi: async function() {
                    if (!App.State.currentProject) return App.UI.showToast("请先选择或新建一个项目！", "error");
                    const input = document.getElementById('newApiInput');
                    const path = input.value.trim().split('?')[0]; 
                    
                    if(!path) return App.UI.showToast('请输入 API 路径', 'error');
                    if(App.State.apiList.find(a => a.path === path)) return App.UI.showToast('该 API 已存在当前项目中', 'error');

                    const result = await App.API.post('/api/add', { path });
                    if (!result.success) return App.UI.showToast(result.msg || '添加失败', 'error');

                    input.value = '';
                    App.UI.showToast('API 添加成功', 'success');
                    await this.fetchList(); 
                    this.selectApi(path);   
                },

                deleteApi: function(e, path) {
                    e.stopPropagation(); 
                    App.UI.showConfirm(
                        "确认删除",
                        \`确定要停止监控并删除该 API 吗？\`,
                        async () => {
                            await App.API.post('/api/delete', { path });
                            if(App.State.currentApi === path) {
                                App.State.currentApi = null;
                                document.getElementById('workspaceContainer').style.display = 'none';
                                document.getElementById('currentApiDisplay').innerText = "-";
                                document.getElementById('actionMenuBtn').disabled = true;
                            }
                            App.UI.showToast('API 已删除', 'success');
                            this.fetchList(); 
                        }
                    );
                },

                syncLeftToRight: function() {
                    if(!App.State.currentApi) return;
                    try { 
                        App.State.mockEditor.set(App.State.originalEditor.get()); 
                        App.UI.showToast('成功同步真实响应至 Mock 面板', 'success');
                    } catch (e) { 
                        App.UI.showToast('真实响应数据格式存在错误', 'error'); 
                    }
                },

                saveApiData: async function() {
                    if(!App.State.currentApi || !App.State.currentProject) return;
                    try {
                        const payload = {
                            path: App.State.currentApi,
                            enabled: document.getElementById('mockToggle').checked,
                            originalData: App.State.originalEditor.get(),
                            mockData: App.State.mockEditor.get()
                        };

                        const result = await App.API.post('/api/save', payload);
                        if(result.success) {
                            const btn = document.getElementById('actionMenuBtn');
                            
                            btn.classList.replace('text-gray-500', 'text-emerald-600');
                            App.UI.showToast('数据已保存', 'success');
                            this.fetchList(); 
                            
                            if (App.State.saveTimeoutId) clearTimeout(App.State.saveTimeoutId);
                            App.State.saveTimeoutId = setTimeout(() => {
                                btn.classList.replace('text-emerald-600', 'text-gray-500');
                            }, 1000);
                        } else {
                            App.UI.showToast(result.msg || '保存失败', 'error');
                        }
                    } catch (err) {
                        App.UI.showToast('保存失败，请检查编辑器内的 JSON 语法是否正确', 'error');
                    }
                },

                copyText: function(elementId, copyName) {
                    const el = document.getElementById(elementId);
                    let textToCopy = el.value || el.innerText;
                    if (!textToCopy || textToCopy === '无域名 (仅路径)' || textToCopy === '解析失败') {
                        return App.UI.showToast('没有可复制的有效内容', 'error');
                    }
                    
                    const tempInput = document.createElement("input");
                    tempInput.value = textToCopy;
                    document.body.appendChild(tempInput);
                    tempInput.select();
                    tempInput.setSelectionRange(0, 99999); 
                    try {
                        document.execCommand("copy");
                        App.UI.showToast(\`\${copyName} 已复制\`, "success");
                    } catch (err) {
                        App.UI.showToast("复制失败", "error");
                    }
                    document.body.removeChild(tempInput);
                },

                generateRegex: function() {
                    let input = document.getElementById('regexInput').value.trim();
                    let hostOut = document.getElementById('hostOutput');
                    let regOut = document.getElementById('regexOutput');
                    
                    if (!input) {
                        hostOut.value = '';
                        regOut.value = '';
                        return;
                    }
                    
                    try {
                        let parsedUrl = new URL(input.startsWith('http') ? input : 'https://' + input);
                        if (input.startsWith('http') || input.includes('//')) {
                            hostOut.value = parsedUrl.hostname;
                        } else {
                            hostOut.value = '无域名 (仅路径)';
                        }
                    } catch(e) {
                        hostOut.value = '解析失败';
                    }

                    let escapedStr = input.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&');
                    regOut.value = '^' + escapedStr;
                },
                
                formatTime: function(ts) {
                    if(!ts) return '未更新';
                    const d = new Date(ts);
                    const pad = n => n < 10 ? '0'+n : n;
                    return \`\${pad(d.getHours())}:\${pad(d.getMinutes())}:\${pad(d.getSeconds())}\`;
                }
            },

            UI: {
                handleGlobalClick: function(e) {
                    const pList = document.getElementById('customSelectList');
                    const pContainer = document.getElementById('projectSelectContainer');
                    if(pList && !pList.classList.contains('hidden') && pContainer && !pContainer.contains(e.target)) {
                        pList.classList.add('hidden');
                    }
                    const aList = document.getElementById('actionMenuList');
                    const aContainer = document.getElementById('actionMenuContainer');
                    if(aList && !aList.classList.contains('hidden') && aContainer && !aContainer.contains(e.target)) {
                        aList.classList.add('hidden');
                    }
                },

                showToast: function(msg, type = 'info') {
                    const toast = document.getElementById('toast');
                    const content = document.getElementById('toastContent');
                    let icon = type === 'success' ? '<i class="iconfont icon-xunhuan1 mr-2 text-emerald-300"></i>' 
                             : type === 'error' ? '<i class="iconfont icon-shanchu mr-2 text-red-300"></i>' 
                             : '';
                    
                    content.innerHTML = icon + msg;
                    
                    if (type === 'error') content.className = 'bg-red-600 text-white px-5 py-3 rounded-xl shadow-2xl text-sm flex items-center font-bold tracking-wide';
                    else if (type === 'success') content.className = 'bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl text-sm flex items-center font-bold tracking-wide';
                    else content.className = 'bg-gray-800 text-white px-5 py-3 rounded-xl shadow-2xl text-sm flex items-center font-bold tracking-wide';

                    toast.classList.remove('opacity-0', '-translate-y-5', 'pointer-events-none');
                    toast.classList.add('opacity-100', 'translate-y-0');
                    setTimeout(() => {
                        toast.classList.remove('opacity-100', 'translate-y-0');
                        toast.classList.add('opacity-0', '-translate-y-5', 'pointer-events-none');
                    }, 2500);
                },

                renderProjectSelect: function() {
                    const listEl = document.getElementById('customSelectList');
                    const textEl = document.getElementById('customSelectText');
                    const btnEl = document.getElementById('customSelectBtn');
                    listEl.innerHTML = '';
                    
                    if (App.State.projectList.length === 0) {
                        textEl.innerText = '请先新建项目...';
                        textEl.classList.add('text-gray-400');
                        btnEl.classList.add('cursor-not-allowed', 'bg-gray-100');
                        document.getElementById('delProjBtn').disabled = true;
                        return;
                    }
                    
                    document.getElementById('delProjBtn').disabled = false;
                    btnEl.classList.remove('cursor-not-allowed', 'bg-gray-100');
                    textEl.classList.remove('text-gray-400');
                    textEl.innerText = App.State.currentProject || '请选择项目';

                    App.State.projectList.forEach(p => {
                        let li = document.createElement('li');
                        li.className = \`px-4 py-3 text-sm font-medium cursor-pointer transition-colors \${p === App.State.currentProject ? 'bg-indigo-50 text-indigo-700 font-bold border-l-4 border-indigo-500' : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'}\`;
                        li.innerText = p;
                        li.onclick = (e) => {
                            e.stopPropagation();
                            listEl.classList.add('hidden');
                            if (p !== App.State.currentProject) App.Core.switchProject(p);
                        };
                        listEl.appendChild(li);
                    });
                },

                renderApiList: function() {
                    const listEl = document.getElementById('apiList');
                    listEl.innerHTML = '';
                    
                    if(App.State.apiList.length === 0) {
                        listEl.innerHTML = \`<div class="text-center text-sm text-gray-400 mt-10 font-medium">【\${App.State.currentProject}】暂无 API<br>请在上方输入路径添加</div>\`;
                        return;
                    }

                    App.State.apiList.sort((a, b) => (b.updateTime || 0) - (a.updateTime || 0));

                    App.State.apiList.forEach(item => {
                        const urlParts = item.path.split('/');
                        const shortName = '/' + urlParts.slice(-2).join('/'); 

                        const div = document.createElement('div');
                        div.className = \`p-3 rounded-xl cursor-pointer border transition-all duration-200 group relative \${App.State.currentApi === item.path ? 'bg-indigo-50 border-indigo-200 shadow-sm ring-1 ring-indigo-100' : 'bg-white border-gray-100 hover:border-indigo-100 hover:shadow-sm'}\`;
                        
                        let statusDot = item.enabled 
                            ? '<span class="w-2.5 h-2.5 rounded-full bg-emerald-400 mr-2.5 flex-shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.8)]" title="Mock 已开启"></span>'
                            : '<span class="w-2.5 h-2.5 rounded-full bg-gray-300 mr-2.5 flex-shrink-0" title="未开启，监控原数据"></span>';

                        const actionIcons = \`
                            <div class="absolute right-3 top-3 opacity-100 md:opacity-0 group-hover:opacity-100 flex items-center gap-3 transition-opacity">
                                <button onclick="App.UI.refreshSingleApi(event, '\${item.path}', this)" class="text-gray-400 hover:text-indigo-500 transition-colors flex items-center justify-center p-0.5" title="刷新数据">
                                    <i class="iconfont icon-xunhuan1 text-base font-bold block"></i>
                                </button>
                                <button onclick="App.Core.deleteApi(event, '\${item.path}')" class="text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center p-0.5" title="删除 API">
                                    <i class="iconfont icon-shanchu text-base font-bold block"></i>
                                </button>
                            </div>
                        \`;

                        div.innerHTML = \`
                            <div class="flex items-center pr-20 w-full overflow-hidden">
                                \${statusDot}
                                <span class="text-sm font-bold text-gray-800 truncate flex-1" title="\${item.path}">\${shortName}</span>
                            </div>
                            <div class="text-[10px] text-gray-400 mt-1.5 flex justify-between pl-5 pr-1">
                                <span class="truncate pr-2">\${item.path}</span>
                                <span class="flex-shrink-0 font-mono font-medium">\${App.Core.formatTime(item.updateTime)}</span>
                            </div>
                            \${actionIcons}
                        \`;

                        div.onclick = () => App.Core.selectApi(item.path);
                        listEl.appendChild(div);
                    });
                },

                setNoProjectState: function() {
                    document.getElementById('newApiInput').disabled = true;
                    document.getElementById('addApiBtn').disabled = true;
                    document.getElementById('apiList').innerHTML = '<div class="text-center text-sm text-gray-400 mt-10 font-medium">没有任何项目<br>请点击上方 "+" 号创建</div>';
                    
                    App.State.currentApi = null;
                    document.getElementById('currentApiDisplay').innerText = "-";
                    document.getElementById('actionMenuBtn').disabled = true;
                    document.getElementById('workspaceContainer').style.display = 'none';
                },

                enableWorkspace: function() {
                    document.getElementById('newApiInput').disabled = false;
                    document.getElementById('addApiBtn').disabled = false;
                    document.getElementById('workspaceContainer').style.display = 'none';
                },

                toggleSidebar: function() {
                    const sb = document.getElementById('sidebar');
                    const overlay = document.getElementById('mobileOverlay');
                    
                    if (window.innerWidth < 768) {
                        sb.classList.toggle('-translate-x-full');
                        if (sb.classList.contains('-translate-x-full')) overlay.classList.add('hidden');
                        else overlay.classList.remove('hidden');
                    } else {
                        if (sb.classList.contains('md:w-80')) {
                            sb.classList.replace('md:w-80', 'md:w-0');
                            sb.classList.remove('md:border-r'); 
                        } else {
                            sb.classList.replace('md:w-0', 'md:w-80');
                            sb.classList.add('md:border-r');
                        }
                    }
                    setTimeout(() => this.adjustEditorHeight(), 300);
                },

                toggleProjectDropdown: function(e) {
                    e.stopPropagation();
                    if (document.getElementById('customSelectBtn').classList.contains('cursor-not-allowed')) return;
                    document.getElementById('customSelectList').classList.toggle('hidden');
                },

                toggleActionMenu: function(e) {
                    if(e) e.stopPropagation();
                    if(document.getElementById('actionMenuBtn').disabled) return;
                    document.getElementById('actionMenuList').classList.toggle('hidden');
                },

                refreshSingleApi: async function(e, path, btnElement) {
                    e.stopPropagation();
                    const icon = btnElement.querySelector('i');
                    icon.classList.add('animate-spin'); 
                    await App.Core.fetchList(); 
                    if (App.State.currentApi === path) await App.Core.selectApi(path);
                    setTimeout(() => icon.classList.remove('animate-spin'), 500);
                },

                showConfirm: function(title, msg, onConfirm) {
                    document.getElementById('confirmTitle').innerHTML = \`<i class="iconfont icon-shanchu text-red-500 mr-2 text-xl"></i>\${title}\`;
                    document.getElementById('confirmMsg').innerText = msg;
                    App.State.confirmCallback = onConfirm;
                    document.getElementById('confirmModal').classList.remove('hidden');
                },
                closeConfirmModal: function() {
                    document.getElementById('confirmModal').classList.add('hidden');
                    App.State.confirmCallback = null;
                },
                triggerConfirm: function() {
                    if(App.State.confirmCallback) App.State.confirmCallback();
                    this.closeConfirmModal();
                },

                openCreateProjModal: function() {
                    document.getElementById('projNameInput').value = '';
                    document.getElementById('createProjModal').classList.remove('hidden');
                    setTimeout(() => document.getElementById('projNameInput').focus(), 100);
                },
                closeCreateProjModal: function() {
                    document.getElementById('createProjModal').classList.add('hidden');
                },

                openFullApiModal: function() {
                    if(!App.State.currentApi) return;
                    let el = document.getElementById('fullApiText');
                    if(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = App.State.currentApi;
                    else el.innerText = App.State.currentApi;
                    document.getElementById('fullApiModal').classList.remove('hidden');
                },
                closeFullApiModal: function() {
                    document.getElementById('fullApiModal').classList.add('hidden');
                },

                openToolbox: function() {
                    document.getElementById('toolboxModal').classList.remove('hidden');
                    this.switchTab('help');
                },
                closeToolbox: function() {
                    document.getElementById('toolboxModal').classList.add('hidden');
                },

                switchTab: async function(tabName) {
                    const tabs = ['help', 'regex', 'storage'];
                    tabs.forEach(t => {
                        document.getElementById(\`tab-\${t}\`).classList.add('hidden');
                        document.getElementById(\`tabBtn-\${t}\`).classList.remove('border-indigo-600', 'text-indigo-600');
                        document.getElementById(\`tabBtn-\${t}\`).classList.add('border-transparent', 'text-gray-500');
                    });
                    
                    document.getElementById(\`tab-\${tabName}\`).classList.remove('hidden');
                    document.getElementById(\`tabBtn-\${tabName}\`).classList.add('border-indigo-600', 'text-indigo-600');
                    document.getElementById(\`tabBtn-\${tabName}\`).classList.remove('border-transparent', 'text-gray-500');

                    if(tabName === 'regex') {
                        if (App.State.currentApi) document.getElementById('regexInput').value = App.State.currentApi;
                        App.Core.generateRegex();
                    }

                    if(tabName === 'storage') {
                        const sc = document.getElementById('storageContent');
                        sc.innerText = '正在获取底层键名映射...';
                        try {
                            const data = await App.API.get('/api/sys/storage');
                            sc.innerText = JSON.stringify(data, null, 4);
                        } catch(e) {
                            sc.innerText = '获取失败: ' + e.message;
                        }
                    }
                },

                adjustEditorHeight: function() {
                    const header = document.getElementById('headerArea');
                    const pOri = document.getElementById('editorPanelOriginal');
                    const pMock = document.getElementById('editorPanelMock');
                    
                    if (document.getElementById('workspaceContainer').style.display === 'none') return;
                    if (!header || !pOri || !pMock) return;

                    const availableHeight = window.innerHeight - header.offsetHeight - 32; 
                    const isMobile = window.innerWidth < 768;

                    if (isMobile) {
                        if (App.State.editorExpandState === 'split') {
                            const halfHeight = Math.floor((availableHeight - 16) / 2);
                            pOri.style.height = halfHeight + 'px';
                            pMock.style.height = halfHeight + 'px';
                        } else {
                            pOri.style.height = availableHeight + 'px';
                            pMock.style.height = availableHeight + 'px';
                        }
                        pOri.style.width = '100%';
                        pMock.style.width = '100%';
                    } else {
                        pOri.style.height = availableHeight + 'px';
                        pMock.style.height = availableHeight + 'px';
                        
                        if (App.State.editorExpandState === 'split') {
                            pOri.style.width = 'calc(50% - 8px)'; 
                            pMock.style.width = 'calc(50% - 8px)';
                        } else {
                            pOri.style.width = '100%';
                            pMock.style.width = '100%';
                        }
                    }
                },

                applyEditorExpandState: function() {
                    const pOri = document.getElementById('editorPanelOriginal');
                    const pMock = document.getElementById('editorPanelMock');
                    const iOri = document.getElementById('icon-expand-original');
                    const iMock = document.getElementById('icon-expand-mock');

                    const svgExpand = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>';
                    const svgCollapse = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 14h6m0 0v6m0-6l-7 7m17-11h-6m0 0V4m0 6l7-7M4 10h6m0 0V4m0 6l-7-7m17 11h-6m0 0v6m0-6l7 7"></path>';

                    if (App.State.editorExpandState === 'original') {
                        pMock.style.display = 'none';
                        pOri.style.display = 'flex';
                        iOri.innerHTML = svgCollapse;
                    } else if (App.State.editorExpandState === 'mock') {
                        pOri.style.display = 'none';
                        pMock.style.display = 'flex';
                        iMock.innerHTML = svgCollapse;
                    } else {
                        pOri.style.display = 'flex';
                        pMock.style.display = 'flex';
                        iOri.innerHTML = svgExpand;
                        iMock.innerHTML = svgExpand;
                    }
                    this.adjustEditorHeight();
                },

                toggleEditorExpand: function(target) {
                    App.State.editorExpandState = App.State.editorExpandState === target ? 'split' : target;
                    localStorage.setItem('MockBox_Expand_State', App.State.editorExpandState);
                    this.applyEditorExpandState();
                }
            }
        };

        document.getElementById('confirmOkBtn').onclick = () => App.UI.triggerConfirm();

        window.App = App;
        App.init();
    </script>
</body>
</html>`;
}
