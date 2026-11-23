import {ChangeEvent,useEffect,useId,useState} from 'react';

interface FilePickerProps {
 label?: string;
 file: File | null;
 onChange: (file: File | null) => void;
 id?: string;
}

export default function FilePicker({label='Photo (optional)',file,onChange,id}:FilePickerProps){
 const generatedId = useId();
 const inputId = id || generatedId;
 const [preview,setPreview]=useState<string|null>(null);
 const [error,setError]=useState<string>('');

 useEffect(()=>{
  if(!file){
   setPreview(null);
   return;
  }
  const url = URL.createObjectURL(file);
  setPreview(url);
  return ()=>{
   URL.revokeObjectURL(url);
  };
 },[file]);

 function handleFileChange(e:ChangeEvent<HTMLInputElement>){
  const selected = e.target.files?.[0]??null;
  setError('');

  if(!selected){
   onChange(null);
   return;
  }

  // Validate file type
  if(!selected.type.startsWith('image/')){
   setError('Please select an image file (e.g. JPG, PNG, WebP).');
   onChange(null);
   e.target.value = '';
   return;
  }

  // Validate file size (5 MB limit)
  const maxBytes = 5 * 1024 * 1024;
  if(selected.size > maxBytes){
   setError('File size exceeds 5 MB limit. Please select a smaller photo.');
   onChange(null);
   e.target.value = '';
   return;
  }

  onChange(selected);
 }

 function handleRemove(){
  setError('');
  onChange(null);
  const el = document.getElementById(inputId) as HTMLInputElement | null;
  if(el) el.value = '';
 }

 return (
  <div className="file-picker-wrap">
   {label && <label htmlFor={inputId} className="file-picker-label">{label}</label>}

   {/* Accessible visually hidden file input */}
   <input
    id={inputId}
    type="file"
    accept="image/*"
    onChange={handleFileChange}
    className="file-picker-input-hidden"
   />

   <div className="file-picker-controls">
    <label htmlFor={inputId} className="file-picker-btn" tabIndex={0} onKeyDown={(e)=>{
     if(e.key==='Enter'||e.key===' '){
      e.preventDefault();
      document.getElementById(inputId)?.click();
     }
    }}>
     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
     </svg>
     <span>{file ? 'Change photo' : 'Choose photo'}</span>
    </label>

    <span className="file-picker-name" title={file ? file.name : 'No photo chosen'}>
     {file ? file.name : 'No photo chosen'}
    </span>
   </div>

   {error && <p className="msg err" role="alert" style={{margin:'6px 0 0',fontSize:'.88rem'}}>{error}</p>}

   {preview && (
    <div className="file-picker-preview-row">
     <img src={preview} alt="Chosen preview" className="file-picker-thumb"/>
     <button type="button" className="file-picker-remove-btn" onClick={handleRemove} aria-label="Remove photo">
      Remove
     </button>
    </div>
   )}
  </div>
 );
}
