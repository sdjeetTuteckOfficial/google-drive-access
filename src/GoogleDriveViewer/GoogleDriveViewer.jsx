import React, { useState, useEffect, useMemo } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import {
  Check,
  Minus,
  X,
  Loader2,
  Folder,
  FileText,
  Image as ImageIcon,
  ChevronRight,
  ArrowLeft,
  Paperclip,
  List,
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

// --- Recursive Tree Component (Auto-Expanded) ---
const RecursiveTreeItem = ({
  node,
  level = 0,
  onRemoveFile,
  defaultExpanded = true,
}) => {
  // State initializes to true to ensure it opens immediately
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const hasChildren = Object.keys(node.children).length > 0;
  const hasFiles = node.files.length > 0;

  // Virtual Root Handling
  if (node.id === 'root-virtual') {
    return (
      <div className='flex flex-col gap-1'>
        {Object.values(node.children).map((childNode) => (
          <RecursiveTreeItem
            key={childNode.id}
            node={childNode}
            level={0}
            onRemoveFile={onRemoveFile}
            defaultExpanded={true} // Explicitly pass true
          />
        ))}
        {node.files.map((file) => (
          <TreeFileRow
            key={file.id}
            file={file}
            level={0}
            onRemoveFile={onRemoveFile}
          />
        ))}
      </div>
    );
  }

  return (
    <div className='select-none text-slate-700 relative'>
      {/* Folder Row */}
      <div
        className='flex items-center gap-1.5 py-1 px-2 rounded hover:bg-slate-100 cursor-pointer transition-colors'
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Indent Guide */}
        {level > 0 && (
          <div
            className='absolute left-0 border-l-2 border-dashed border-slate-300 h-full'
            style={{ left: '-8px' }}
          ></div>
        )}

        <div
          className={`transition-transform duration-200 text-slate-400 ${
            isExpanded ? 'rotate-90' : ''
          }`}
        >
          {hasChildren || hasFiles ? (
            <ChevronRight className='w-3.5 h-3.5' />
          ) : (
            <span className='w-3.5 h-3.5 block' />
          )}
        </div>

        <Folder className='w-4 h-4 text-amber-400 fill-amber-100 shrink-0' />

        <span className='text-sm font-semibold truncate flex-1'>
          {node.name}
        </span>

        {/* Count Badge */}
        <span className='text-[10px] font-bold text-slate-400'>
          ({node.files.length + Object.keys(node.children).length})
        </span>
      </div>

      {/* Children Container */}
      {isExpanded && (
        <div className='relative pl-4 ml-2 border-l border-dashed border-slate-300'>
          {Object.values(node.children).map((childNode) => (
            <RecursiveTreeItem
              key={childNode.id}
              node={childNode}
              level={level + 1}
              onRemoveFile={onRemoveFile}
              defaultExpanded={true} // Ensure children also default to open
            />
          ))}

          {node.files.map((file) => (
            <TreeFileRow
              key={file.id}
              file={file}
              level={level + 1}
              onRemoveFile={onRemoveFile}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Helper for File Rows
const TreeFileRow = ({ file, onRemoveFile }) => (
  <div className='group/file flex items-center justify-between py-1 px-2 rounded hover:bg-white hover:shadow-sm transition-all ml-1'>
    <div className='flex items-center gap-2 overflow-hidden'>
      {/* Checkmark Box */}
      <div className='w-3.5 h-3.5 bg-blue-600 rounded-[3px] flex items-center justify-center shrink-0'>
        <Check className='w-2.5 h-2.5 text-white stroke-[3]' />
      </div>

      <FileText className='w-3.5 h-3.5 text-slate-400 shrink-0' />
      <span className='text-xs text-slate-600 truncate' title={file.name}>
        {file.name}
      </span>
    </div>

    <button
      onClick={(e) => {
        e.stopPropagation();
        onRemoveFile(file);
      }}
      className='text-slate-300 hover:text-red-500 opacity-0 group-hover/file:opacity-100 transition-opacity'
    >
      <X className='w-3 h-3' />
    </button>
  </div>
);

function GoogleDriveViewer() {
  const [token, setToken] = useState(null);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [messageText, setMessageText] = useState('');

  // Navigation State
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [folderStack, setFolderStack] = useState([
    { id: 'root', name: 'My Drive' },
  ]);

  // Selection State
  const [checkedFiles, setCheckedFiles] = useState(new Map());
  const [folderSelectionStatus, setFolderSelectionStatus] = useState(new Map());

  // UI State
  const [loadingFolders, setLoadingFolders] = useState(new Set());
  const [toast, setToast] = useState(null);

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState([]);

  const MAX_FILES = 50;

  const showToast = (message, type = 'info') => setToast({ message, type });

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setToken(tokenResponse.access_token);
      await listFiles(tokenResponse.access_token, 'root');
      setShowFilePicker(true);
    },
    onError: () => showToast('Login failed', 'error'),
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    flow: 'implicit',
  });

  const listFiles = async (accessToken = token, folderId = currentFolderId) => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const query = `'${folderId}' in parents and trashed=false`;
      const response = await fetch(
        'https://www.googleapis.com/drive/v3/files?' +
          new URLSearchParams({
            pageSize: '100',
            fields: 'nextPageToken, files(id, name, mimeType, size)',
            orderBy: 'folder,modifiedTime desc',
            q: query,
          }),
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!response.ok) throw new Error('API Error');
      const data = await response.json();
      setFiles(data.files || []);
    } catch (err) {
      showToast('Failed to load files', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFolderContents = async (folderId) => {
    try {
      const query = `'${folderId}' in parents and trashed=false`;
      const response = await fetch(
        'https://www.googleapis.com/drive/v3/files?' +
          new URLSearchParams({
            pageSize: '50',
            fields: 'files(id, name, mimeType, size)',
            q: query,
          }),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      return data.files || [];
    } catch (e) {
      return [];
    }
  };

  // --- SELECTION LOGIC ---

  const handleFileCheck = (file) => {
    setCheckedFiles((prev) => {
      const newChecked = new Map(prev);
      if (newChecked.has(file.id)) {
        newChecked.delete(file.id);
      } else {
        if (newChecked.size >= MAX_FILES) {
          showToast(`Limit reached. Max ${MAX_FILES} items.`, 'error');
          return prev;
        }
        newChecked.set(file.id, {
          ...file,
          pathPath: [...folderStack],
        });
      }
      return newChecked;
    });
  };

  const handleFolderCheck = async (folder) => {
    const isAlreadySelected = folderSelectionStatus.has(folder.id);

    // UNCHECK FOLDER
    if (isAlreadySelected) {
      setFolderSelectionStatus((prev) => {
        const next = new Map(prev);
        next.delete(folder.id);
        return next;
      });
      setCheckedFiles((prev) => {
        const next = new Map(prev);
        for (const [id, file] of next.entries()) {
          if (
            file.pathPath &&
            file.pathPath[file.pathPath.length - 1].id === folder.id
          ) {
            next.delete(id);
          }
        }
        return next;
      });
      return;
    }

    // CHECK FOLDER
    setLoadingFolders((prev) => new Set(prev).add(folder.id));
    try {
      const contents = await fetchFolderContents(folder.id);

      const validItems = contents;

      if (validItems.length === 0) {
        showToast('Folder is empty', 'info');
        // Still add it so it shows up in tree (as empty)
        // return;
      }

      setCheckedFiles((prev) => {
        const slotsLeft = MAX_FILES - prev.size;
        if (slotsLeft <= 0) {
          showToast('Selection full.', 'error');
          return prev;
        }

        const newMap = new Map(prev);
        let addedCount = 0;
        const newPath = [...folderStack, { id: folder.id, name: folder.name }];

        for (const item of validItems) {
          if (addedCount >= slotsLeft) break;
          if (!newMap.has(item.id)) {
            newMap.set(item.id, {
              ...item,
              pathPath: newPath,
            });
            addedCount++;
          }
        }

        const isPartial = addedCount < validItems.length;

        setFolderSelectionStatus((statusMap) => {
          const next = new Map(statusMap);
          next.set(folder.id, {
            status: isPartial ? 'partial' : 'all',
            name: folder.name,
          });
          return next;
        });

        return newMap;
      });
    } catch (error) {
      showToast('Error reading folder', 'error');
    } finally {
      setLoadingFolders((prev) => {
        const next = new Set(prev);
        next.delete(folder.id);
        return next;
      });
    }
  };

  const processSelection = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const results = Array.from(checkedFiles.values()).filter(
        (f) => !f.mimeType.includes('folder')
      );
      setProcessedFiles((prev) => [...prev, ...results]);
      setIsProcessing(false);
      setCheckedFiles(new Map());
      setFolderSelectionStatus(new Map());
      setShowFilePicker(false);
      showToast('Attached successfully', 'success');
    }, 1500);
  };

  const removeAttachedFile = (fileId) => {
    setProcessedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const openFolder = (id, name) => {
    setCurrentFolderId(id);
    setFolderStack([...folderStack, { id, name }]);
    listFiles(token, id);
  };

  const goBackOneStep = () => {
    if (folderStack.length > 1) {
      const newStack = folderStack.slice(0, -1);
      const parent = newStack[newStack.length - 1];
      setFolderStack(newStack);
      setCurrentFolderId(parent.id);
      listFiles(token, parent.id);
    }
  };

  const handleBreadcrumbClick = (index) => {
    if (index === folderStack.length - 1) return;
    const newStack = folderStack.slice(0, index + 1);
    const targetFolder = newStack[newStack.length - 1];
    setFolderStack(newStack);
    setCurrentFolderId(targetFolder.id);
    listFiles(token, targetFolder.id);
  };

  const getIcon = (mime) => {
    if (mime.includes('folder'))
      return <Folder className='w-5 h-5 text-blue-600 fill-blue-50' />;
    if (mime.includes('image'))
      return <ImageIcon className='w-5 h-5 text-purple-600' />;
    if (mime.includes('pdf'))
      return <FileText className='w-5 h-5 text-red-500' />;
    return <FileText className='w-5 h-5 text-slate-500' />;
  };

  // --- TREE BUILDER LOGIC ---
  const selectionTree = useMemo(() => {
    const root = { id: 'root-virtual', name: 'Root', children: {}, files: [] };

    checkedFiles.forEach((file) => {
      let currentNode = root;
      const path = file.pathPath || [];

      // 1. Traverse Path
      path.forEach((folder) => {
        if (folder.id === 'root') return;
        if (!currentNode.children[folder.id]) {
          currentNode.children[folder.id] = {
            id: folder.id,
            name: folder.name,
            children: {},
            files: [],
          };
        }
        currentNode = currentNode.children[folder.id];
      });

      // 2. Place the Item (Folder or File)
      const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

      if (isFolder) {
        if (!currentNode.children[file.id]) {
          currentNode.children[file.id] = {
            id: file.id,
            name: file.name,
            children: {},
            files: [],
          };
        }
      } else {
        currentNode.files.push(file);
      }
    });

    return root;
  }, [checkedFiles]);

  return (
    <div className='min-h-screen bg-white flex items-center justify-center p-6 font-sans text-slate-900'>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className='w-full max-w-2xl'>
        <h1 className='text-2xl font-bold mb-6 text-slate-800'>New Message</h1>

        <div className='bg-white border border-slate-300 rounded-xl shadow-sm overflow-hidden flex flex-col'>
          {processedFiles.length > 0 && (
            <div className='px-3 pt-3 flex flex-wrap gap-2'>
              {processedFiles.map((file) => (
                <div
                  key={file.id}
                  className='bg-slate-100 flex items-center gap-2 px-2 py-1 rounded text-xs text-slate-700'
                >
                  <FileText className='w-3 h-3 text-slate-400' />
                  <span>{file.name}</span>
                  <button
                    onClick={() => removeAttachedFile(file.id)}
                    className='text-slate-400 hover:text-red-500'
                  >
                    <X className='w-3 h-3' />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder='Type a message...'
            className='w-full p-4 min-h-[100px] outline-none resize-none text-slate-800'
          />
          <div className='px-3 py-2 bg-slate-50 border-t border-slate-100 flex justify-between'>
            <button
              onClick={() => (!token ? login() : setShowFilePicker(true))}
              className='flex items-center gap-2 text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors'
            >
              <Paperclip className='w-4 h-4' /> Attach from Drive
            </button>
            <button className='bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium'>
              Send
            </button>
          </div>
        </div>
      </div>

      {/* --- FILE PICKER MODAL --- */}
      {showFilePicker && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
          <div
            className='absolute inset-0 bg-black/40 backdrop-blur-sm'
            onClick={() => setShowFilePicker(false)}
          />

          <div className='relative bg-white w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200'>
            {/* Header */}
            <div className='px-6 py-4 border-b flex justify-between items-center bg-white z-10 shrink-0'>
              <div>
                <h2 className='text-xl font-bold text-slate-800'>
                  Select Files
                </h2>
                <div className='text-sm text-slate-500 mt-0.5'>
                  <span
                    className={`${
                      checkedFiles.size >= MAX_FILES
                        ? 'text-red-500 font-bold'
                        : 'text-blue-600 font-medium'
                    }`}
                  >
                    {checkedFiles.size} / {MAX_FILES}
                  </span>{' '}
                  items selected
                </div>
              </div>
              <div className='flex gap-3'>
                <button
                  onClick={() => setShowFilePicker(false)}
                  className='px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium'
                >
                  Cancel
                </button>
                <button
                  onClick={processSelection}
                  disabled={checkedFiles.size === 0}
                  className='px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-sm font-medium shadow-sm transition-all'
                >
                  Attach Selected
                </button>
              </div>
            </div>

            {/* SPLIT VIEW */}
            <div className='flex flex-1 overflow-hidden'>
              {/* LEFT: FILE BROWSER */}
              <div className='flex-1 flex flex-col min-w-0 border-r border-slate-200'>
                {/* Breadcrumbs */}
                <div className='px-6 py-3 bg-slate-50 border-b flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0'>
                  {folderStack.length > 1 && (
                    <button
                      onClick={goBackOneStep}
                      className='p-1.5 hover:bg-slate-200 rounded-md mr-1 text-slate-500'
                    >
                      <ArrowLeft className='w-4 h-4' />
                    </button>
                  )}
                  {folderStack.map((f, i) => (
                    <div
                      key={f.id}
                      className='flex items-center text-sm whitespace-nowrap'
                    >
                      {i > 0 && (
                        <ChevronRight className='w-4 h-4 text-slate-300 mx-1' />
                      )}
                      <span
                        onClick={() => handleBreadcrumbClick(i)}
                        className={`cursor-pointer px-2 py-1 rounded ${
                          i === folderStack.length - 1
                            ? 'font-semibold bg-white border border-slate-200 shadow-sm'
                            : 'text-slate-500 hover:text-blue-600'
                        }`}
                      >
                        {f.name}
                      </span>
                    </div>
                  ))}
                </div>

                {/* File Grid */}
                <div className='flex-1 overflow-y-auto p-4 bg-slate-50/30'>
                  {isLoading ? (
                    <div className='flex flex-col items-center justify-center h-full text-slate-400'>
                      <Loader2 className='w-8 h-8 animate-spin mb-2 text-blue-500' />{' '}
                      Loading...
                    </div>
                  ) : (
                    <div className='space-y-2'>
                      {files.map((file) => {
                        const isDir =
                          file.mimeType ===
                          'application/vnd.google-apps.folder';
                        const isFileSelected = checkedFiles.has(file.id);
                        const folderStatus = folderSelectionStatus.get(file.id);
                        const isAnySelected = isDir
                          ? !!folderStatus
                          : isFileSelected;
                        const isLoadingFolder = loadingFolders.has(file.id);

                        return (
                          <div
                            key={file.id}
                            className={`group flex items-center px-4 py-3 rounded-lg border transition-all duration-200 ${
                              isAnySelected
                                ? 'border-blue-500 bg-blue-50'
                                : 'bg-white border-slate-200 hover:border-blue-300'
                            }`}
                          >
                            <div
                              className='mr-4 flex-shrink-0'
                              onClick={(e) => {
                                e.stopPropagation();
                                isDir
                                  ? handleFolderCheck(file)
                                  : handleFileCheck(file);
                              }}
                            >
                              {isLoadingFolder ? (
                                <Loader2 className='w-5 h-5 text-blue-600 animate-spin' />
                              ) : (
                                <div
                                  className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-all ${
                                    isAnySelected
                                      ? 'bg-blue-600 border-blue-600'
                                      : 'border-slate-300 bg-white hover:border-blue-400'
                                  }`}
                                >
                                  {isDir &&
                                  folderStatus?.status === 'partial' ? (
                                    <Minus className='w-3 h-3 text-white' />
                                  ) : (
                                    isAnySelected && (
                                      <Check className='w-3.5 h-3.5 text-white stroke-[3]' />
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                            <div
                              className={`flex-1 flex items-center gap-3 overflow-hidden ${
                                isDir ? 'cursor-pointer' : ''
                              }`}
                              onClick={() =>
                                isDir && openFolder(file.id, file.name)
                              }
                            >
                              <div
                                className={`p-2 rounded-lg ${
                                  isDir
                                    ? 'bg-blue-100 text-blue-600'
                                    : 'bg-slate-100'
                                }`}
                              >
                                {getIcon(file.mimeType)}
                              </div>
                              <div className='flex-1 min-w-0'>
                                <span
                                  className={`text-sm font-medium truncate block ${
                                    isAnySelected
                                      ? 'text-blue-900'
                                      : 'text-slate-700'
                                  }`}
                                >
                                  {file.name}
                                </span>
                              </div>
                              {isDir && (
                                <ChevronRight className='w-5 h-5 text-slate-300 group-hover:text-blue-500' />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT: UPDATED SELECTION TREE */}
              <div className='w-80 bg-slate-50 flex flex-col border-l border-slate-200 shadow-inner'>
                <div className='p-4 border-b border-slate-200 bg-slate-100/50'>
                  <h3 className='text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2'>
                    <List className='w-4 h-4' /> Selected Items
                  </h3>
                </div>

                <div className='flex-1 overflow-y-auto p-4'>
                  {checkedFiles.size === 0 ? (
                    <div className='h-full flex flex-col items-center justify-center text-slate-400 text-center opacity-60'>
                      <Paperclip className='w-10 h-10 mb-2' />
                      <p className='text-sm font-medium'>No files selected</p>
                    </div>
                  ) : (
                    <RecursiveTreeItem
                      node={selectionTree}
                      onRemoveFile={(file) => {
                        setCheckedFiles((prev) => {
                          const next = new Map(prev);
                          next.delete(file.id);
                          return next;
                        });
                      }}
                      defaultExpanded={true} // Force Expansion from Root
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Processing Overlay */}
      {isProcessing && (
        <div className='fixed inset-0 z-[60] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center'>
          <div className='bg-white p-6 rounded-2xl shadow-2xl border border-slate-100 flex flex-col items-center w-64'>
            <Loader2 className='w-8 h-8 text-blue-600 animate-spin mb-3' />
            <h3 className='font-semibold text-slate-800 mb-2'>Processing...</h3>
          </div>
        </div>
      )}
    </div>
  );
}

export default GoogleDriveViewer;
