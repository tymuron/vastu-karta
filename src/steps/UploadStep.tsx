import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import { cn } from '../lib/cn'
import { Upload, Image as ImageIcon } from 'lucide-react'

export default function UploadStep() {
  const { state, dispatch } = useStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const loadFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result as string
      const img = new Image()
      img.onload = () => dispatch({ type: 'setImage', src, w: img.width, h: img.height })
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  const loadSample = () => {
    const src = `${import.meta.env.BASE_URL}sample/floorplan.svg`
    const img = new Image()
    img.onload = () =>
      dispatch({ type: 'setImage', src, w: img.width || 1000, h: img.height || 800 })
    img.src = src
  }

  return (
    <div className="space-y-4">
      <p className="font-sans text-base leading-relaxed text-vastu-text">
        Подойдёт фото, скан или картинка плана квартиры. Всё считается прямо в браузере —
        план никуда не отправляется.
      </p>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) loadFile(f)
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
          dragOver ? 'border-vastu-gold bg-vastu-gold/10' : 'border-vastu-sand bg-white',
        )}
      >
        <Upload size={28} className="text-vastu-gold-deep" />
        <div className="font-sans text-sm text-vastu-dark">
          Перетащите план или нажмите для выбора
        </div>
        <div className="font-sans text-xs text-vastu-text-light">JPG, PNG или WebP</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) loadFile(f)
          }}
        />
      </div>

      <button
        onClick={loadSample}
        className="flex items-center gap-2 font-sans text-xs text-vastu-text-light underline-offset-2 hover:text-vastu-dark hover:underline"
      >
        <ImageIcon size={14} /> Использовать пример плана
      </button>

      {state.imageSrc && (
        <div className="rounded-xl border border-vastu-sand bg-white/70 px-4 py-3 font-sans text-xs text-vastu-dark">
          План загружен · {state.imageW}×{state.imageH}px
        </div>
      )}
    </div>
  )
}
