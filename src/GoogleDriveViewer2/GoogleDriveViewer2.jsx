import React, { useState, useEffect, useCallback } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import {
  Check,
  X,
  Loader2,
  Folder,
  FileText,
  ChevronRight,
  Paperclip,
  List,
  Download,
  FolderOpen,
} from 'lucide-react';

// --- Toast Component ---
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColors = {
    error: 'bg-red-500 text-white',
    success: 'bg-green-600 text-white',
    info: 'bg-slate-800 text-white',
    warning: 'bg-amber-500 text-white',
  };

  return (
    <div
      className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-xl flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-4 ${bgColors[type]}`}
    >
      <span className='font-medium text-sm'>{message}</span>
      <button onClick={onClose} className='ml-2 opacity-70 hover:opacity-100'>
        <X className='w-4 h-4' />
      </button>
    </div>
  );
};

// --- API Helpers ---
const fetchFolderContents = async (token, folderId) => {
  try {
    const query = `'${folderId}' in parents and trashed=false`;
    const response = await fetch(
      'https://www.googleapis.com/drive/v3/files?' +
        new URLSearchParams({
          pageSize: '100',
          fields: 'files(id, name, mimeType, size)',
          orderBy: 'folder,name',
          q: query,
        }),
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) throw new Error('API Error');
    const data = await response.json();
    return data.files || [];
  } catch (e) {
    console.error(e);
    return [];
  }
};

const downloadFileFromDrive = async (token, file) => {
  if (file.mimeType.includes('folder')) return null;

  let url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  let filename = file.name;

  if (file.mimeType.startsWith('application/vnd.google-apps.')) {
    url = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=application/pdf`;
    filename += '.pdf';
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error('Download failed');
  const blob = await response.blob();
  return new File([blob], filename, { type: blob.type });
};

// --- TREE NODE COMPONENT ---
const TreeNode = ({
  item,
  level = 0,
  isExpanded,
  onToggleExpand,
  onSelect,
  isSelected, // Simply true or false now
  childrenFiles,
  isLoadingChildren,
  isSelectable = true,
}) => {
  const isFolder = item.mimeType === 'application/vnd.google-apps.folder';

  const handleRowClick = (e) => {
    e.stopPropagation();
    if (isFolder) {
      onToggleExpand(item);
    } else if (isSelectable) {
      onSelect(item);
    }
  };

  const handleCheckbox = (e) => {
    e.stopPropagation();
    onSelect(item);
  };

  return (
    <div className='select-none text-slate-700'>
      <div
        className={`relative flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors duration-200 
          ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-100'}
        `}
        style={{ marginLeft: level === 0 ? 0 : '16px' }}
        onClick={handleRowClick}
      >
        {level > 0 && (
          <>
            <div
              className='absolute top-0 bottom-0 border-l-2 border-dashed border-slate-300'
              style={{ left: '-12px' }}
            />
            <div
              className='absolute top-1/2 w-3 h-0.5 bg-slate-300 -translate-y-1/2'
              style={{ left: '-12px' }}
            />
          </>
        )}

        {/* Arrow / Spinner */}
        <div
          className={`transition-transform duration-200 text-slate-400 shrink-0 ${
            isExpanded ? 'rotate-90' : ''
          }`}
        >
          {isFolder ? (
            isLoadingChildren ? (
              <Loader2 className='w-3.5 h-3.5 animate-spin text-blue-500' />
            ) : (
              <ChevronRight className='w-3.5 h-3.5' />
            )
          ) : (
            <span className='w-3.5 block' />
          )}
        </div>

        {/* Icon */}
        {isFolder ? (
          isExpanded ? (
            <FolderOpen className='w-4 h-4 text-amber-500 fill-amber-50' />
          ) : (
            <Folder className='w-4 h-4 text-amber-400 fill-amber-100' />
          )
        ) : (
          <FileText
            className={`w-4 h-4 ${
              isSelected ? 'text-blue-500' : 'text-slate-400'
            }`}
          />
        )}

        {/* Name */}
        <span
          className={`text-sm truncate flex-1 ${
            isSelected ? 'font-medium text-blue-700' : 'text-slate-700'
          }`}
        >
          {item.name}
        </span>

        {/* Checkbox - SIMPLIFIED: Just Check or Empty */}
        {isSelectable && (
          <div
            onClick={handleCheckbox}
            className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 z-10
              ${
                isSelected
                  ? 'bg-blue-600 border-blue-600'
                  : 'border-slate-300 hover:border-blue-400 bg-white'
              }
            `}
          >
            {isSelected && <Check className='w-3 h-3 text-white stroke-[3]' />}
          </div>
        )}
      </div>

      {/* Children */}
      {isFolder && isExpanded && (
        <div className='relative border-l-2 border-dashed border-slate-300 ml-[11px] pl-1'>
          {childrenFiles && childrenFiles.length > 0 ? (
            childrenFiles.map((child) => (
              <TreeNode
                key={child.id}
                item={child}
                level={level + 1}
                isExpanded={child.isExpanded}
                onToggleExpand={onToggleExpand}
                onSelect={onSelect}
                isSelected={child.isSelected}
                childrenFiles={child.children}
                isLoadingChildren={child.isLoading}
                isSelectable={true}
              />
            ))
          ) : isLoadingChildren ? (
            <div className='py-2 pl-6 text-xs text-slate-500 flex items-center gap-2'>
              <Loader2 className='w-3 h-3 animate-spin' /> Loading contents...
            </div>
          ) : (
            <div className='py-1 pl-6 text-xs text-slate-400 italic'>
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- MAIN COMPONENT ---
function GoogleDrivePicker() {
  const [token, setToken] = useState(null);

  // -- Tree State --
  const [folderCache, setFolderCache] = useState({});
  const [expandedIds, setExpandedIds] = useState(new Set(['root']));
  const [loadingIds, setLoadingIds] = useState(new Set());

  // -- Selection State --
  const [selectedItems, setSelectedItems] = useState(new Map());

  // -- UI --
  const [toast, setToast] = useState(null);
  const [showPicker, setShowPicker] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [attachedItems, setAttachedItems] = useState([]);

  const MAX_ITEMS = 5;
  const showToast = (message, type = 'info') => setToast({ message, type });

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setToken(tokenResponse.access_token);
      await loadFolder(tokenResponse.access_token, 'root');
      setShowPicker(true);
    },
    onError: () => showToast('Login failed', 'error'),
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    flow: 'implicit',
  });

  const loadFolder = async (accessToken, folderId) => {
    if (folderCache[folderId]) return folderCache[folderId];
    setLoadingIds((prev) => new Set(prev).add(folderId));
    try {
      const files = await fetchFolderContents(accessToken, folderId);
      setFolderCache((prev) => ({ ...prev, [folderId]: files }));
      return files;
    } catch (e) {
      showToast('Error loading folder', 'error');
      return [];
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      });
    }
  };

  const handleToggleExpand = async (item) => {
    if (expandedIds.has(item.id)) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    } else {
      setExpandedIds((prev) => new Set(prev).add(item.id));
      if (!folderCache[item.id]) {
        await loadFolder(token, item.id);
      }
    }
  };

  // --- RECURSIVE LOGIC ---

  // Recursively gets all FILE objects under a folder
  // Accepts 'currentCache' to handle cases where state hasn't updated yet
  const getAllFilesRecursively = useCallback((folderId, currentCache) => {
    let files = [];
    const children = currentCache[folderId] || [];

    children.forEach((child) => {
      if (child.mimeType.includes('folder')) {
        files = [...files, ...getAllFilesRecursively(child.id, currentCache)];
      } else {
        files.push(child);
      }
    });

    return files;
  }, []);

  // Simplified: If ANY file inside is selected, return TRUE.
  const getIsFolderSelected = (folderId) => {
    const allFilesInTree = getAllFilesRecursively(folderId, folderCache);
    if (allFilesInTree.length === 0) return false;

    // Returns true if ANY file in this folder is currently selected
    return allFilesInTree.some((f) => selectedItems.has(f.id));
  };

  // --- CORE SELECTION LOGIC ---
  const handleSelectItem = async (item) => {
    const isFolder = item.mimeType.includes('folder');

    if (isFolder) {
      // 1. Auto-expand visually
      setExpandedIds((prev) => new Set(prev).add(item.id));

      // 2. Ensure Data is Loaded (Wait for it!)
      let currentCache = { ...folderCache };
      let children = currentCache[item.id];

      if (!children) {
        setLoadingIds((prev) => new Set(prev).add(item.id));
        try {
          // Fetch and update our LOCAL variable for calculation
          const newFiles = await loadFolder(token, item.id);
          currentCache[item.id] = newFiles;
        } catch (e) {
          return;
        }
      }

      // 3. Get ALL files recursively using the FRESH cache
      const allDescendants = getAllFilesRecursively(item.id, currentCache);

      if (allDescendants.length === 0) {
        showToast('Folder is empty', 'warning');
        return;
      }

      // 4. Determine Action:
      // If ANY file is already selected -> Deselect All (Clear).
      // If NOTHING is selected -> Select All (Fill).
      const anySelected = allDescendants.some((f) => selectedItems.has(f.id));

      setSelectedItems((prev) => {
        const next = new Map(prev);

        if (anySelected) {
          // DESELECT ACTION: Clear this folder
          allDescendants.forEach((f) => next.delete(f.id));
        } else {
          // SELECT ACTION: Fill up to limit
          let addedThisTurn = 0;

          for (const file of allDescendants) {
            if (next.size >= MAX_ITEMS) break;
            if (!next.has(file.id)) {
              next.set(file.id, file);
              addedThisTurn++;
            }
          }

          if (next.size >= MAX_ITEMS && addedThisTurn > 0) {
            if (
              allDescendants.length > addedThisTurn &&
              next.size === MAX_ITEMS
            ) {
              showToast(`Limit of ${MAX_ITEMS} reached`, 'warning');
            }
          }
        }
        return next;
      });
    } else {
      // SINGLE FILE TOGGLE
      setSelectedItems((prev) => {
        const next = new Map(prev);
        if (next.has(item.id)) {
          next.delete(item.id);
        } else {
          if (next.size >= MAX_ITEMS) {
            showToast(`Max ${MAX_ITEMS} items allowed`, 'error');
            return prev;
          }
          next.set(item.id, item);
        }
        return next;
      });
    }
  };

  const processSelection = async () => {
    setIsProcessing(true);
    try {
      const itemsToProcess = Array.from(selectedItems.values());
      const processed = await Promise.all(
        itemsToProcess.map(async (item) => {
          try {
            const fileObj = await downloadFileFromDrive(token, item);
            return {
              id: item.id,
              name: fileObj.name,
              fileObject: fileObj,
              mimeType: item.mimeType,
            };
          } catch (e) {
            return null;
          }
        })
      );

      setAttachedItems((prev) => [...prev, ...processed.filter(Boolean)]);
      setSelectedItems(new Map());
      setShowPicker(false);
      showToast('Files attached!', 'success');
    } catch (e) {
      showToast('Error processing items', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const removeAttached = (id) => {
    setAttachedItems((prev) => prev.filter((f) => f.id !== id));
  };

  const triggerDownload = (fileObj) => {
    if (!fileObj) return;
    const url = URL.createObjectURL(fileObj);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileObj.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper to build render tree
  const buildBrowserNode = (fileItem) => {
    const isFolder = fileItem.mimeType.includes('folder');
    const isExpanded = expandedIds.has(fileItem.id);
    const isLoading = loadingIds.has(fileItem.id);

    // Determine Selection State
    let isSelected = false;
    if (isFolder) {
      isSelected = getIsFolderSelected(fileItem.id);
    } else {
      isSelected = selectedItems.has(fileItem.id);
    }

    let children = [];
    if (isFolder && isExpanded && folderCache[fileItem.id]) {
      children = folderCache[fileItem.id].map((child) =>
        buildBrowserNode(child)
      );
    }

    return {
      ...fileItem,
      isExpanded,
      isSelected, // Clean boolean
      isLoading,
      children,
    };
  };

  const rootNodes = folderCache['root']
    ? folderCache['root'].map((f) => buildBrowserNode(f))
    : [];

  return (
    <div className='min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans text-slate-900'>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className='w-full max-w-2xl'>
        <h1 className='text-2xl font-bold mb-6 text-slate-800'>New Message</h1>
        <div className='bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden flex flex-col'>
          {attachedItems.length > 0 && (
            <div className='px-4 pt-4 flex flex-wrap gap-2'>
              {attachedItems.map((item) => (
                <div
                  key={item.id}
                  className='bg-white border border-slate-200 shadow-sm flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-slate-700 animate-in fade-in zoom-in-95'
                >
                  <FileText className='w-3.5 h-3.5 text-blue-500' />
                  <span className='font-medium max-w-[150px] truncate'>
                    {item.name}
                  </span>
                  <button
                    onClick={() => triggerDownload(item.fileObject)}
                    className='text-slate-400 hover:text-blue-600 ml-1'
                  >
                    <Download className='w-3.5 h-3.5' />
                  </button>
                  <div className='w-px h-3 bg-slate-200 mx-1'></div>
                  <button
                    onClick={() => removeAttached(item.id)}
                    className='text-slate-400 hover:text-red-500'
                  >
                    <X className='w-3.5 h-3.5' />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder='Type a message...'
            className='w-full p-4 min-h-[100px] outline-none resize-none text-slate-800 placeholder:text-slate-400'
          />

          <div className='px-4 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center'>
            <button
              onClick={() => (!token ? login() : setShowPicker(true))}
              className='flex items-center gap-2 text-blue-700 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg text-sm font-semibold transition-all'
            >
              <Paperclip className='w-4 h-4' /> Attach from Drive
            </button>
            <button className='bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-semibold shadow-sm'>
              Send Message
            </button>
          </div>
        </div>
      </div>

      {showPicker && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
          <div
            className='absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity'
            onClick={() => setShowPicker(false)}
          />

          <div className='relative bg-white w-full max-w-5xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200'>
            <div className='px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white z-20'>
              <div>
                <h2 className='text-lg font-bold text-slate-800 flex items-center gap-2'>
                  Select Files
                </h2>
                <p className='text-xs text-slate-500 mt-1'>
                  Selecting a folder selects its files.{' '}
                  <span
                    className={
                      selectedItems.size === MAX_ITEMS
                        ? 'text-red-500 font-bold'
                        : 'text-blue-600 font-bold'
                    }
                  >
                    {selectedItems.size} / {MAX_ITEMS}
                  </span>{' '}
                  selected.
                </p>
              </div>
              <div className='flex gap-3'>
                <button
                  onClick={() => setShowPicker(false)}
                  className='px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium'
                >
                  Cancel
                </button>
                <button
                  onClick={processSelection}
                  disabled={selectedItems.size === 0}
                  className='px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold shadow-sm transition-all flex items-center gap-2'
                >
                  Attach Files
                </button>
              </div>
            </div>

            <div className='flex-1 flex overflow-hidden'>
              {/* LEFT: BROWSER TREE */}
              <div className='flex-1 flex flex-col border-r border-slate-100 bg-white min-w-0'>
                <div className='p-3 bg-slate-50/50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider pl-6'>
                  My Drive Browser
                </div>
                <div className='flex-1 overflow-y-auto p-4 custom-scrollbar'>
                  <div className='pb-10'>
                    <TreeNode
                      item={{
                        name: 'My Drive',
                        mimeType: 'application/vnd.google-apps.folder',
                        id: 'root',
                      }}
                      level={0}
                      isExpanded={expandedIds.has('root')}
                      onToggleExpand={handleToggleExpand}
                      onSelect={handleSelectItem}
                      isSelected={getIsFolderSelected('root')} // Root check state
                      isLoadingChildren={loadingIds.has('root')}
                      childrenFiles={rootNodes}
                      isSelectable={false}
                    />
                  </div>
                </div>
              </div>

              {/* RIGHT: SELECTION SUMMARY */}
              <div className='w-72 bg-slate-50/50 flex flex-col shadow-inner'>
                <div className='p-3 border-b border-slate-200 bg-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2'>
                  <List className='w-3.5 h-3.5' /> Selected Items
                </div>
                <div className='flex-1 overflow-y-auto p-3'>
                  {selectedItems.size === 0 ? (
                    <div className='h-full flex flex-col items-center justify-center text-slate-400 space-y-2 opacity-60'>
                      <FolderOpen className='w-8 h-8' />
                      <p className='text-xs'>No items selected</p>
                    </div>
                  ) : (
                    <div className='flex flex-col gap-2'>
                      {Array.from(selectedItems.values()).map((item) => (
                        <div
                          key={item.id}
                          className='bg-white border border-slate-200 p-2 rounded-md shadow-sm flex items-start gap-2 group animate-in slide-in-from-right-4'
                        >
                          <FileText className='w-4 h-4 text-blue-500 mt-0.5 shrink-0' />
                          <div className='min-w-0 flex-1'>
                            <p
                              className='text-xs font-medium text-slate-700 truncate'
                              title={item.name}
                            >
                              {item.name}
                            </p>
                          </div>
                          <button
                            onClick={() => handleSelectItem(item)} // Toggles it off
                            className='text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity'
                          >
                            <X className='w-3.5 h-3.5' />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className='fixed inset-0 z-[60] bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center'>
          <Loader2 className='w-10 h-10 text-blue-600 animate-spin mb-4' />
          <h3 className='text-lg font-bold text-slate-800'>Downloading...</h3>
        </div>
      )}
    </div>
  );
}

export default GoogleDrivePicker;
