import React, { useState, useEffect } from 'react';
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
  Send,
  Download, // Imported Download Icon
  AlertCircle,
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

  const MAX_FILES = 5;

  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState([]);
  const [processingProgress, setProcessingProgress] = useState(0);

  // UI State
  const [loadingFolders, setLoadingFolders] = useState(new Set());
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      if (args[0]?.includes?.('Cross-Origin-Opener-Policy')) return;
      originalError.apply(console, args);
    };
    return () => {
      console.error = originalError;
    };
  }, []);

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

  // --- API Actions ---

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

  // --- REAL DOWNLOAD LOGIC ---
  const downloadFileFromDrive = async (file) => {
    let url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    let filename = file.name;

    // Handle Google Docs Conversion
    if (file.mimeType.startsWith('application/vnd.google-apps.')) {
      if (file.mimeType.includes('document')) {
        url = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=application/pdf`;
        filename += '.pdf';
      } else if (file.mimeType.includes('spreadsheet')) {
        url = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
        filename += '.xlsx';
      } else if (file.mimeType.includes('presentation')) {
        url = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=application/vnd.openxmlformats-officedocument.presentationml.presentation`;
        filename += '.pptx';
      } else {
        // Fallback or skip
        throw new Error('Unsupported Google Doc type');
      }
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error('Download failed');

    const blob = await response.blob();
    // Create a real JS File object
    return new File([blob], filename, { type: blob.type });
  };

  // --- Selection Logic ---
  const handleFileCheck = (file) => {
    setCheckedFiles((prev) => {
      const newChecked = new Map(prev);
      if (newChecked.has(file.id)) {
        newChecked.delete(file.id);
      } else {
        if (newChecked.size >= MAX_FILES) {
          showToast(`Limit reached. Max ${MAX_FILES} files.`, 'error');
          return prev;
        }
        newChecked.set(file.id, { ...file, parentFolderId: currentFolderId });
      }
      return newChecked;
    });
  };

  const handleFolderCheck = async (folder) => {
    const isAlreadySelected = folderSelectionStatus.has(folder.id);

    if (isAlreadySelected) {
      setFolderSelectionStatus((prev) => {
        const next = new Map(prev);
        next.delete(folder.id);
        return next;
      });
      setCheckedFiles((prev) => {
        const next = new Map(prev);
        for (const [id, file] of next.entries()) {
          if (file.parentFolderId === folder.id) next.delete(id);
        }
        return next;
      });
      return;
    }

    setLoadingFolders((prev) => new Set(prev).add(folder.id));

    try {
      const contents = await fetchFolderContents(folder.id);
      const validFiles = contents.filter(
        (f) =>
          !f.mimeType.startsWith('application/vnd.google-apps.') &&
          f.mimeType !== 'application/vnd.google-apps.folder'
      );

      if (validFiles.length === 0) {
        showToast('Folder is empty', 'info');
        return;
      }

      setCheckedFiles((prev) => {
        const slotsLeft = MAX_FILES - prev.size;
        if (slotsLeft <= 0) {
          showToast('Selection full.', 'error');
          return prev;
        }

        const newMap = new Map(prev);
        let addedCount = 0;

        for (const file of validFiles) {
          if (addedCount >= slotsLeft) break;
          if (!newMap.has(file.id)) {
            newMap.set(file.id, { ...file, parentFolderId: folder.id });
            addedCount++;
          }
        }

        const isPartial = addedCount < validFiles.length;
        setFolderSelectionStatus((statusMap) => {
          const next = new Map(statusMap);
          next.set(folder.id, isPartial ? 'partial' : 'all');
          return next;
        });

        isPartial
          ? showToast(`Added ${addedCount} files. Limit reached.`, 'warning')
          : showToast(`Selected ${addedCount} files.`, 'success');

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

  // --- Processing Logic ---
  const processSelection = async () => {
    setIsProcessing(true);
    setProcessingProgress(0);
    setShowFilePicker(false);

    const total = checkedFiles.size;
    let current = 0;
    const results = [];

    for (const fileMetadata of checkedFiles.values()) {
      try {
        // ACTUAL API CALL to get file content
        const fileObject = await downloadFileFromDrive(fileMetadata);

        results.push({
          id: fileMetadata.id,
          name: fileObject.name, // Use name from conversion if changed (e.g. .pdf)
          mimeType: fileMetadata.mimeType,
          size: fileObject.size,
          fileObject: fileObject, // Store the blob/file
          status: 'success',
        });
      } catch (error) {
        console.error(error);
        showToast(`Failed to download ${fileMetadata.name}`, 'error');
      }

      current++;
      setProcessingProgress(Math.round((current / total) * 100));
    }

    setProcessedFiles((prev) => [...prev, ...results]);
    setIsProcessing(false);
    setCheckedFiles(new Map());
    setFolderSelectionStatus(new Map());
    showToast('Files attached & downloaded successfully', 'success');
  };

  // --- Client Side Download Handler ---
  const handleDownloadFile = (fileItem) => {
    if (!fileItem.fileObject) {
      showToast('File content missing', 'error');
      return;
    }

    // Create a temporary URL for the file blob
    const url = URL.createObjectURL(fileItem.fileObject);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileItem.name;
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const removeAttachedFile = (fileId) => {
    setProcessedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // --- Helper for Icons & Nav ---
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
      return <Folder className='w-5 h-5 text-blue-500 fill-blue-50' />;
    if (mime.includes('image'))
      return <ImageIcon className='w-5 h-5 text-purple-600' />;
    if (mime.includes('pdf'))
      return <FileText className='w-5 h-5 text-red-500' />;
    return <FileText className='w-5 h-5 text-slate-500' />;
  };

  return (
    <div className='min-h-screen bg-white flex items-center justify-center p-6 font-sans text-slate-900'>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className='w-full max-w-2xl'>
        <h1 className='text-2xl font-bold mb-6 text-slate-800'>New Message</h1>

        <div className='bg-white border border-slate-300 rounded-xl shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all overflow-hidden flex flex-col'>
          {/* Attached Files Chips */}
          {processedFiles.length > 0 && (
            <div className='px-3 pt-3 flex flex-wrap gap-2'>
              {processedFiles.map((file) => (
                <div
                  key={file.id}
                  className='flex items-center gap-2 bg-slate-100 border border-slate-200 text-slate-700 text-sm py-1.5 pl-2 pr-1.5 rounded-md animate-in fade-in zoom-in-95 group/chip'
                >
                  {getIcon(file.mimeType)}

                  <span
                    className='max-w-[150px] truncate font-medium'
                    title={file.name}
                  >
                    {file.name}
                  </span>
                  <span className='text-xs text-slate-400'>
                    ({formatSize(file.size)})
                  </span>

                  <div className='flex items-center gap-0.5 border-l border-slate-300 pl-1.5 ml-1'>
                    {/* Download Button */}
                    <button
                      onClick={() => handleDownloadFile(file)}
                      className='p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-blue-600 transition-colors'
                      title='Download file'
                    >
                      <Download className='w-3.5 h-3.5' />
                    </button>

                    {/* Remove Button */}
                    <button
                      onClick={() => removeAttachedFile(file.id)}
                      className='p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-red-500 transition-colors'
                      title='Remove attachment'
                    >
                      <X className='w-3.5 h-3.5' />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder='Type a message...'
            className='w-full p-4 min-h-[120px] outline-none resize-none text-slate-800 placeholder:text-slate-400'
          />

          <div className='px-3 py-2 bg-slate-50 border-t border-slate-100 flex justify-between items-center'>
            <button
              onClick={() => (!token ? login() : setShowFilePicker(true))}
              className='flex items-center gap-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all font-medium text-sm group'
            >
              <div className='bg-slate-200 group-hover:bg-blue-200 p-1.5 rounded-md transition-colors'>
                <Paperclip className='w-4 h-4' />
              </div>
              <span>Attach from Drive</span>
            </button>

            <button className='bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium text-sm transition-all shadow-sm'>
              <span>Send</span>
              <Send className='w-3.5 h-3.5' />
            </button>
          </div>
        </div>

        <p className='text-xs text-slate-400 mt-2 text-right'>
          Supports Google Drive Attachments (Auto-converts Docs)
        </p>
      </div>

      {/* --- File Picker Modal (Same as before) --- */}
      {showFilePicker && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
          <div
            className='absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity'
            onClick={() => setShowFilePicker(false)}
          />

          <div className='relative bg-white w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200'>
            {/* Header */}
            <div className='px-6 py-4 border-b flex justify-between items-center bg-white z-10'>
              <div>
                <h2 className='text-lg font-bold text-slate-800'>
                  Select files to attach
                </h2>
                <div className='text-xs text-slate-500 mt-0.5'>
                  <span
                    className={`${
                      checkedFiles.size === MAX_FILES
                        ? 'text-red-500 font-bold'
                        : 'text-blue-600 font-medium'
                    }`}
                  >
                    {checkedFiles.size} / {MAX_FILES}
                  </span>{' '}
                  files selected
                </div>
              </div>
              <div className='flex gap-3'>
                <button
                  onClick={() => setShowFilePicker(false)}
                  className='px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium transition'
                >
                  Cancel
                </button>
                <button
                  onClick={processSelection}
                  disabled={checkedFiles.size === 0}
                  className='px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-sm font-medium transition shadow-md shadow-blue-500/20 disabled:shadow-none'
                >
                  Attach & Download
                </button>
              </div>
            </div>

            {/* Breadcrumbs */}
            <div className='px-6 py-2 bg-slate-50 border-b flex items-center gap-2 overflow-x-auto no-scrollbar'>
              {folderStack.length > 1 && (
                <button
                  onClick={goBackOneStep}
                  className='p-1.5 hover:bg-slate-200 rounded-md mr-1 text-slate-500'
                  title='Go Back'
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
                    className={`cursor-pointer transition-colors px-1.5 py-0.5 rounded ${
                      i === folderStack.length - 1
                        ? 'font-semibold text-slate-900 bg-white shadow-sm border border-slate-200'
                        : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
                    }`}
                  >
                    {f.name}
                  </span>
                </div>
              ))}
            </div>

            {/* File List */}
            <div className='flex-1 overflow-y-auto p-4 bg-slate-50/30'>
              {isLoading ? (
                <div className='flex flex-col items-center justify-center h-full text-slate-400'>
                  <Loader2 className='w-8 h-8 animate-spin mb-2 text-blue-500' />
                  Loading...
                </div>
              ) : (
                <div className='space-y-1.5'>
                  {files.map((file) => {
                    const isDir =
                      file.mimeType === 'application/vnd.google-apps.folder';
                    const isFileSelected = checkedFiles.has(file.id);
                    const folderStatus = folderSelectionStatus.get(file.id);
                    const isFolderSelected = !!folderStatus;
                    const isAnySelected = isDir
                      ? isFolderSelected
                      : isFileSelected;
                    const isLoadingFolder = loadingFolders.has(file.id);
                    const canSelect =
                      isDir ||
                      !file.mimeType.startsWith('application/vnd.google-apps.');

                    return (
                      <div
                        key={file.id}
                        className={`group flex items-center px-4 py-3 bg-white rounded-lg border transition-all ${
                          isAnySelected
                            ? 'border-blue-500 bg-blue-50/20 z-10 relative'
                            : 'border-slate-200 hover:border-blue-300 hover:shadow-sm'
                        }`}
                      >
                        <div
                          className='mr-4 flex-shrink-0'
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canSelect) {
                              if (isDir) handleFolderCheck(file);
                              else handleFileCheck(file);
                            }
                          }}
                        >
                          {isLoadingFolder ? (
                            <Loader2 className='w-5 h-5 text-blue-600 animate-spin' />
                          ) : (
                            <div
                              className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-all duration-200 ${
                                isAnySelected
                                  ? 'bg-blue-600 border-blue-600'
                                  : 'border-slate-300 bg-white hover:border-blue-400'
                              }`}
                            >
                              {isDir && folderStatus === 'partial' ? (
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
                            className={`p-1.5 rounded-md ${
                              isAnySelected ? 'bg-white/50' : 'bg-slate-100'
                            }`}
                          >
                            {getIcon(file.mimeType)}
                          </div>

                          <div className='flex-1 min-w-0 flex flex-col justify-center'>
                            <span
                              className={`text-sm font-medium truncate ${
                                isAnySelected
                                  ? 'text-blue-900'
                                  : 'text-slate-700'
                              }`}
                            >
                              {file.name}
                            </span>
                            <div className='flex items-center gap-2 text-xs text-slate-400'>
                              <span>
                                {isDir
                                  ? folderStatus === 'partial'
                                    ? 'Partial'
                                    : 'Folder'
                                  : formatSize(file.size)}
                              </span>
                              {!canSelect && !isDir && (
                                <span className='text-red-500 bg-red-50 px-1.5 rounded text-[10px] font-medium border border-red-100'>
                                  Not Supported
                                </span>
                              )}
                            </div>
                          </div>

                          {isDir && (
                            <ChevronRight className='w-4 h-4 text-slate-300 group-hover:text-blue-400 transition-colors' />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className='px-6 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex justify-between'>
              <span>Supported: Images, PDF, Video, Audio</span>
              <span>Max 5 attachments</span>
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
              Downloading...
            </h3>
            <div className='w-full bg-slate-100 rounded-full h-1.5 overflow-hidden'>
              <div
                className='bg-blue-600 h-full transition-all duration-300'
                style={{ width: `${processingProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper for size
const formatSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export default GoogleDriveViewer;
