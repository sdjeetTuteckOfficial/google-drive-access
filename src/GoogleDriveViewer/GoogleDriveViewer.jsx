import React, { useState, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';

function GoogleDriveViewer() {
  const [token, setToken] = useState(null);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [message, setMessage] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [folderStack, setFolderStack] = useState([
    { id: 'root', name: 'My Drive' },
  ]);

  // Suppress COOP warning
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

  // Login Hook with redirect flow
  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      console.log('Login Success');
      setToken(tokenResponse.access_token);
      listFiles(tokenResponse.access_token, 'root');
    },
    onError: (error) => {
      console.error('Login Failed:', error);
      alert('Login failed. Please try again.');
    },
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    flow: 'implicit',
  });

  // Check if file is downloadable
  const isDownloadableFile = (mimeType) => {
    const nonDownloadable = [
      'application/vnd.google-makersuite.prompt',
      'application/vnd.google-apps.folder',
      'application/vnd.google-apps.map',
      'application/vnd.google-apps.site',
    ];
    return (
      !nonDownloadable.includes(mimeType) &&
      !mimeType.startsWith('application/vnd.google-apps.')
    );
  };

  // Check if item is a folder
  const isFolder = (mimeType) => {
    return mimeType === 'application/vnd.google-apps.folder';
  };

  // List Files using REST API
  const listFiles = async (accessToken = token, folderId = currentFolderId) => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      const query = `'${folderId}' in parents and trashed=false`;
      const response = await fetch(
        'https://www.googleapis.com/drive/v3/files?' +
          new URLSearchParams({
            pageSize: '50',
            fields:
              'nextPageToken, files(id, name, mimeType, webViewLink, iconLink, thumbnailLink, size, modifiedTime)',
            orderBy: 'folder,modifiedTime desc',
            q: query,
          }),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      setFiles(data.files || []);
      setShowFilePicker(true);
    } catch (err) {
      console.error('Error listing files:', err);
      alert(
        'Failed to load files. Please check your permissions and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Open folder
  const openFolder = (folderId, folderName) => {
    setCurrentFolderId(folderId);
    setFolderStack([...folderStack, { id: folderId, name: folderName }]);
    listFiles(token, folderId);
  };

  // Go back to parent folder
  const goBackFolder = () => {
    if (folderStack.length > 1) {
      const newStack = folderStack.slice(0, -1);
      const parentFolder = newStack[newStack.length - 1];
      setFolderStack(newStack);
      setCurrentFolderId(parentFolder.id);
      listFiles(token, parentFolder.id);
    }
  };

  // Go to specific folder in path
  const goToFolder = (index) => {
    const newStack = folderStack.slice(0, index + 1);
    const targetFolder = newStack[newStack.length - 1];
    setFolderStack(newStack);
    setCurrentFolderId(targetFolder.id);
    listFiles(token, targetFolder.id);
  };

  // Download file from Google Drive
  const downloadFile = async (fileId, fileName, mimeType) => {
    try {
      setUploadStatus(`Downloading ${fileName}...`);

      let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

      // For Google Workspace files, export them
      if (mimeType.startsWith('application/vnd.google-apps.')) {
        const exportMap = {
          'application/vnd.google-apps.document': 'application/pdf',
          'application/vnd.google-apps.spreadsheet':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.google-apps.presentation':
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        };

        const exportMimeType = exportMap[mimeType];
        if (exportMimeType) {
          downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(
            exportMimeType
          )}`;
        }
      }

      const response = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      return { blob, fileName };
    } catch (error) {
      console.error('Download error:', error);
      throw error;
    }
  };

  // Upload to S3 (mock function)
  const uploadToS3 = async (file, fileName) => {
    setUploadStatus(`Uploading ${fileName} to S3...`);
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('File would be uploaded to S3:', fileName, file);
        resolve({ success: true, url: `https://s3.example.com/${fileName}` });
      }, 1000);
    });
  };

  // Open file picker
  const openFilePicker = () => {
    if (!token) {
      login();
    } else {
      setShowFilePicker(true);
    }
  };

  // Add file to input
  const addFileToInput = (file) => {
    if (!isDownloadableFile(file.mimeType)) {
      alert(
        `Cannot download ${file.name}. This is a special Google file type (${file.mimeType}) that cannot be exported.`
      );
      return;
    }

    const exists = selectedFiles.find((f) => f.id === file.id);
    if (!exists) {
      setSelectedFiles([...selectedFiles, file]);
    }
    // Don't close the picker - allow multiple selections
  };

  // Remove file from input
  const removeFile = (fileId) => {
    setSelectedFiles(selectedFiles.filter((f) => f.id !== fileId));
  };

  // Handle send with S3 upload
  const handleSend = async () => {
    if (!message.trim() && selectedFiles.length === 0) return;

    try {
      setUploadStatus('Processing files...');

      const uploadedFiles = [];

      for (const file of selectedFiles) {
        try {
          const { blob, fileName } = await downloadFile(
            file.id,
            file.name,
            file.mimeType
          );
          const s3Result = await uploadToS3(blob, fileName);
          uploadedFiles.push({
            name: fileName,
            s3Url: s3Result.url,
          });
        } catch (error) {
          console.error(`Failed to process ${file.name}:`, error);
          alert(`Failed to upload ${file.name}: ${error.message}`);
        }
      }

      console.log('Message:', message);
      console.log('Uploaded Files:', uploadedFiles);

      setUploadStatus('Upload complete!');

      alert(
        `Message: ${message}\n\nUploaded Files (${
          uploadedFiles.length
        }):\n${uploadedFiles.map((f) => `${f.name} -> ${f.s3Url}`).join('\n')}`
      );

      setMessage('');
      setSelectedFiles([]);
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (error) {
      console.error('Send error:', error);
      setUploadStatus('Upload failed!');
      setTimeout(() => setUploadStatus(''), 3000);
    }
  };

  // Get file icon
  const getFileIcon = (mimeType) => {
    if (isFolder(mimeType)) return '📁';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('sheet') || mimeType.includes('csv')) return '📊';
    if (mimeType.includes('document')) return '📝';
    if (mimeType.includes('presentation')) return '📽️';
    if (mimeType.includes('video')) return '🎥';
    if (mimeType.includes('audio')) return '🎵';
    if (mimeType.includes('makersuite')) return '🤖';
    return '📦';
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className='min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4'>
      <div className='w-full max-w-4xl'>
        {/* Header */}
        <div className='text-center mb-8'>
          <h1 className='text-4xl font-bold text-gray-800 mb-2'>
            <span className='text-blue-600'>📁</span> Drive to S3 Uploader
          </h1>
          <p className='text-gray-600'>
            Attach files from Google Drive and upload to S3
          </p>
        </div>

        {/* Main Input Container */}
        <div className='bg-white rounded-2xl shadow-xl p-6'>
          {/* Upload Status */}
          {uploadStatus && (
            <div className='mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700'>
              {uploadStatus}
            </div>
          )}

          {/* Attached Files Display */}
          {selectedFiles.length > 0 && (
            <div className='mb-4 flex flex-wrap gap-2'>
              {selectedFiles.map((file) => (
                <div
                  key={file.id}
                  className='flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 group hover:bg-blue-100 transition'
                >
                  <span className='text-lg'>{getFileIcon(file.mimeType)}</span>
                  <div className='flex flex-col min-w-0'>
                    <span className='text-sm font-medium text-gray-800 truncate max-w-xs'>
                      {file.name}
                    </span>
                    <span className='text-xs text-gray-500'>
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                  <button
                    onClick={() => removeFile(file.id)}
                    className='ml-2 text-gray-400 hover:text-red-600 transition'
                  >
                    <svg
                      className='w-4 h-4'
                      fill='currentColor'
                      viewBox='0 0 20 20'
                    >
                      <path
                        fillRule='evenodd'
                        d='M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z'
                        clipRule='evenodd'
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input Box */}
          <div className='relative'>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder='Type your message here...'
              className='w-full px-4 py-3 pr-24 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none resize-none transition'
              rows='3'
            />

            {/* Action Buttons */}
            <div className='absolute bottom-3 right-3 flex gap-2'>
              {/* Drive Attach Button */}
              <button
                onClick={openFilePicker}
                className='p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition'
                title='Attach from Google Drive'
              >
                <svg
                  className='w-6 h-6'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13'
                  />
                </svg>
              </button>

              {/* Send Button */}
              <button
                onClick={handleSend}
                disabled={!message.trim() && selectedFiles.length === 0}
                className='p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed'
                title='Upload to S3 and send'
              >
                <svg
                  className='w-6 h-6'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12'
                  />
                </svg>
              </button>
            </div>
          </div>

          <p className='text-xs text-gray-500 mt-2'>
            Press Enter to upload • Shift + Enter for new line
          </p>
        </div>
      </div>

      {/* File Picker Modal */}
      {showFilePicker && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'>
          <div className='bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col'>
            {/* Modal Header */}
            <div className='flex items-center justify-between p-6 border-b border-gray-200'>
              <div>
                <h2 className='text-2xl font-bold text-gray-800'>
                  Select from Google Drive
                </h2>
                <p className='text-sm text-gray-500 mt-1'>
                  Click folders to navigate • Select multiple files to attach
                </p>
              </div>
              <button
                onClick={() => setShowFilePicker(false)}
                className='text-gray-400 hover:text-gray-600 transition'
              >
                <svg
                  className='w-6 h-6'
                  fill='currentColor'
                  viewBox='0 0 20 20'
                >
                  <path
                    fillRule='evenodd'
                    d='M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z'
                    clipRule='evenodd'
                  />
                </svg>
              </button>
            </div>

            {/* Breadcrumb Navigation */}
            <div className='flex items-center gap-2 px-6 py-4 border-b border-gray-200 bg-gray-50 overflow-x-auto'>
              {folderStack.map((folder, index) => (
                <React.Fragment key={folder.id}>
                  <button
                    onClick={() => goToFolder(index)}
                    className='text-sm text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap'
                  >
                    {folder.name}
                  </button>
                  {index < folderStack.length - 1 && (
                    <span className='text-gray-400'>/</span>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Modal Content */}
            <div className='flex-1 overflow-y-auto p-6'>
              {isLoading ? (
                <div className='text-center py-12'>
                  <div className='inline-block animate-spin text-4xl mb-3'>
                    ⏳
                  </div>
                  <p className='text-gray-500'>Loading your files...</p>
                </div>
              ) : (
                <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4'>
                  {files.length === 0 ? (
                    <div className='col-span-full text-center py-12'>
                      <p className='text-gray-500'>This folder is empty</p>
                    </div>
                  ) : (
                    files.map((file) => {
                      const isDownloadable = isDownloadableFile(file.mimeType);
                      const isDir = isFolder(file.mimeType);
                      const isSelected = selectedFiles.find(
                        (f) => f.id === file.id
                      );

                      return (
                        <div
                          key={file.id}
                          onClick={() => {
                            if (isDir) {
                              openFolder(file.id, file.name);
                            } else if (isDownloadable) {
                              addFileToInput(file);
                            }
                          }}
                          className={`text-left border-2 rounded-lg p-4 transition-all duration-200 group ${
                            isDir
                              ? 'border-blue-300 hover:border-blue-500 hover:bg-blue-50 cursor-pointer'
                              : isDownloadable
                              ? isSelected
                                ? 'border-green-500 bg-green-50 cursor-pointer'
                                : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50 cursor-pointer'
                              : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                          }`}
                        >
                          <div className='flex items-start gap-3'>
                            <span className='text-3xl'>
                              {getFileIcon(file.mimeType)}
                            </span>
                            <div className='flex-1 min-w-0'>
                              <h3
                                className={`font-medium truncate text-sm ${
                                  isDir
                                    ? 'text-blue-600 group-hover:text-blue-700'
                                    : isDownloadable
                                    ? isSelected
                                      ? 'text-green-700'
                                      : 'text-gray-800 group-hover:text-blue-600'
                                    : 'text-gray-500'
                                }`}
                                title={file.name}
                              >
                                {file.name}
                                {isSelected && isDownloadable && (
                                  <span className='ml-2 text-green-600'>✓</span>
                                )}
                              </h3>
                              <p className='text-xs text-gray-500 mt-1'>
                                {isDir ? 'Folder' : formatFileSize(file.size)}
                              </p>
                              {!isDownloadable && !isDir && (
                                <p className='text-xs text-red-500 mt-1'>
                                  Cannot download
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer with Back Button */}
            {folderStack.length > 1 && (
              <div className='flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50'>
                <button
                  onClick={goBackFolder}
                  className='flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition'
                >
                  <svg
                    className='w-5 h-5'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M15 19l-7-7 7-7'
                    />
                  </svg>
                  Go Back
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default GoogleDriveViewer;
