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
  Download,
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

// --- Recursive Tree Component ---
const RecursiveTreeItem = ({
  node,
  level = 0,
  onRemoveFile,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const hasChildren = Object.keys(node.children).length > 0;
  const hasFiles = node.files.length > 0;

  if (node.id === 'root-virtual') {
    return (
      <div className='flex flex-col gap-1'>
        {Object.values(node.children).map((childNode) => (
          <RecursiveTreeItem
            key={childNode.id}
            node={childNode}
            level={0}
            onRemoveFile={onRemoveFile}
            defaultExpanded={true}
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
      <div
        className='flex items-center gap-1.5 py-1 px-2 rounded hover:bg-slate-100 cursor-pointer transition-colors'
        onClick={() => setIsExpanded(!isExpanded)}
      >
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

        <span className='text-[10px] font-bold text-slate-400'>
          {node.files.length > 0 ? `(${node.files.length} files)` : ''}
        </span>
      </div>

      {isExpanded && (
        <div className='relative pl-4 ml-2 border-l border-dashed border-slate-300'>
          {Object.values(node.children).map((childNode) => (
            <RecursiveTreeItem
              key={childNode.id}
              node={childNode}
              level={level + 1}
              onRemoveFile={onRemoveFile}
              defaultExpanded={true}
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

const TreeFileRow = ({ file, onRemoveFile }) => (
  <div className='group/file flex items-center justify-between py-1 px-2 rounded hover:bg-white hover:shadow-sm transition-all ml-1'>
    <div className='flex items-center gap-2 overflow-hidden'>
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
  const [isProcessing, setIsProcessing] = useState(false);

  // Stored Files State
  const [processedFiles, setProcessedFiles] = useState([]);

  const MAX_FILES = 5;

  const showToast = (message, type = 'info') => setToast({ message, type });

  const currentFileCount = useMemo(() => {
    let count = 0;
    for (const file of checkedFiles.values()) {
      if (!file.mimeType.includes('folder')) {
        count++;
      }
    }
    return count;
  }, [checkedFiles]);

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

  const downloadFileFromDrive = async (file) => {
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

  // --- UPDATED FILE CHECK LOGIC ---
  const handleFileCheck = (file) => {
    setCheckedFiles((prev) => {
      const newChecked = new Map(prev);
      if (newChecked.has(file.id)) {
        newChecked.delete(file.id);
      } else {
        // Enforce Max Limit
        if (currentFileCount >= MAX_FILES) {
          showToast(`Limit reached. Max ${MAX_FILES} files.`, 'error');
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

  // --- UPDATED FOLDER CHECK LOGIC ---
  const handleFolderCheck = async (folder) => {
    // 1. DESELECTION LOGIC
    const isAlreadySelected = folderSelectionStatus.has(folder.id);

    if (isAlreadySelected) {
      setFolderSelectionStatus((prev) => {
        const next = new Map(prev);
        next.delete(folder.id);
        return next;
      });
      // Remove files belonging to this folder from selection
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

    // 2. SELECTION LOGIC
    setLoadingFolders((prev) => new Set(prev).add(folder.id));
    try {
      const contents = await fetchFolderContents(folder.id);

      // RULE: Folder must NOT contain other folders
      const hasSubFolders = contents.some((f) => f.mimeType.includes('folder'));
      if (hasSubFolders) {
        showToast(
          'Cannot select this folder: It contains sub-folders.',
          'error'
        );
        return;
      }

      // Filter only files
      const filesInFolder = contents.filter(
        (f) => !f.mimeType.includes('folder')
      );

      if (filesInFolder.length === 0) {
        showToast('Folder is empty.', 'warning');
        return;
      }

      setCheckedFiles((prev) => {
        // Calculate remaining slots
        let currentCount = 0;
        for (const f of prev.values()) {
          if (!f.mimeType.includes('folder')) currentCount++;
        }

        const slotsLeft = MAX_FILES - currentCount;

        if (slotsLeft <= 0) {
          showToast(`Limit reached. Max ${MAX_FILES} files.`, 'error');
          return prev;
        }

        const newMap = new Map(prev);
        let addedCount = 0;
        const newPath = [...folderStack, { id: folder.id, name: folder.name }];

        // Add files up to the remaining limit
        for (const file of filesInFolder) {
          if (addedCount >= slotsLeft) break; // Stop if limit hit

          if (!newMap.has(file.id)) {
            newMap.set(file.id, {
              ...file,
              pathPath: newPath,
            });
            addedCount++;
          }
        }

        const totalSelected = addedCount;

        // Only mark folder as selected if we actually added something
        if (totalSelected > 0) {
          setFolderSelectionStatus((statusMap) => {
            const next = new Map(statusMap);
            // If we selected fewer files than available (due to limit), mark partial
            const isPartial = totalSelected < filesInFolder.length;

            next.set(folder.id, {
              status: isPartial ? 'partial' : 'all',
              name: folder.name,
            });
            return next;
          });

          if (addedCount < filesInFolder.length) {
            showToast(`Added ${addedCount} files (Limit reached).`, 'warning');
          } else {
            showToast(`Selected ${addedCount} files.`, 'success');
          }
        } else {
          showToast(`Limit reached. No new files added.`, 'error');
        }

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

  const processSelection = async () => {
    setIsProcessing(true);
    try {
      const filesToDownload = Array.from(checkedFiles.values()).filter(
        (f) => !f.mimeType.includes('folder')
      );

      const downloadedFiles = await Promise.all(
        filesToDownload.map(async (f) => {
          try {
            const fileObj = await downloadFileFromDrive(f);
            return {
              id: f.id,
              name: fileObj.name,
              fileObject: fileObj,
              mimeType: f.mimeType,
            };
          } catch (error) {
            console.error('Failed to download', f.name);
            return null;
          }
        })
      );

      const validFiles = downloadedFiles.filter(Boolean);

      setProcessedFiles((prev) => [...prev, ...validFiles]);
      setCheckedFiles(new Map());
      setFolderSelectionStatus(new Map());
      setShowFilePicker(false);
      showToast(`Attached ${validFiles.length} files successfully`, 'success');
    } catch (error) {
      showToast('Error processing files', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const removeAttachedFile = (fileId) => {
    setProcessedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const triggerBrowserDownload = (fileObj) => {
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

  const selectionTree = useMemo(() => {
    const root = { id: 'root-virtual', name: 'Root', children: {}, files: [] };

    checkedFiles.forEach((item) => {
      let currentNode = root;
      const path = item.pathPath || [];

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

      const isFolder = item.mimeType.includes('folder');

      if (isFolder) {
        if (!currentNode.children[item.id]) {
          currentNode.children[item.id] = {
            id: item.id,
            name: item.name,
            children: {},
            files: [],
          };
        }
      } else {
        currentNode.files.push(item);
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
                  className='bg-slate-100 flex items-center gap-2 px-2 py-1 rounded text-xs text-slate-700 border border-slate-200'
                >
                  <FileText className='w-3 h-3 text-slate-400' />
                  <span className='font-medium max-w-[150px] truncate'>
                    {file.name}
                  </span>
                  <button
                    onClick={() => triggerBrowserDownload(file.fileObject)}
                    className='text-slate-400 hover:text-blue-600 p-0.5 rounded hover:bg-slate-200 transition-colors'
                  >
                    <Download className='w-3 h-3' />
                  </button>
                  <div className='w-px h-3 bg-slate-300 mx-0.5'></div>
                  <button
                    onClick={() => removeAttachedFile(file.id)}
                    className='text-slate-400 hover:text-red-500 p-0.5 rounded hover:bg-slate-200 transition-colors'
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
                      currentFileCount === MAX_FILES
                        ? 'text-red-500 font-bold'
                        : 'text-blue-600 font-medium'
                    }`}
                  >
                    {currentFileCount} / {MAX_FILES}
                  </span>{' '}
                  files selected
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
                  disabled={currentFileCount === 0}
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

              {/* RIGHT: SELECTION TREE */}
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
                        // Also clear folder partial/full status if this was the last file
                        // (Simplified: just letting user deselect files one by one is fine)
                      }}
                      defaultExpanded={true}
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
            <h3 className='font-semibold text-slate-800 mb-2'>
              Downloading Files...
            </h3>
            <p className='text-xs text-slate-500'>
              Please wait while we fetch your files.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default GoogleDriveViewer;
