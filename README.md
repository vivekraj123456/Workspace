# CollabAnnotate Pro - Technical Architecture

## Design Choices

### 1. Document Annotation Engine
- **Range-Based Highlighting**: Instead of modifying the document string, we store `start` and `end` indices. This ensures data integrity and allows multiple annotations to overlap seamlessly.
- **Segmented Rendering**: The document content is split into minimal text segments based on annotation boundaries. This approach prevents performance degradation even with thousands of annotations, as the DOM only updates for relevant segments.

### 2. File Parsing Strategy
- **Client-Side Heavy**: Using `PDF.js` and `Mammoth` directly in the browser reduces server load and provides immediate feedback. 
- **OCR Limitation**: Currently, only selectable text is extracted from PDFs. Scanned image PDFs are identified and the user is notified.

### 3. Collaboration & Performance
- **Mock Real-Time**: Implemented via polling with conflict resolution. In a production environment, this would transition to WebSockets (Socket.io).
- **Schema Optimization**: The data model separates `DocumentData` from `Annotations`. This allows loading documents instantly while fetching annotations in the background.

## Edge Case Handling
- **Overlapping Annotations**: The viewer identifies overlapping ranges and provides a tooltip count.
- **Duplicate Prevention**: The service layer checks for identical ranges from the same user before persisting.
- **Large Content**: Textarea previews and high-performance segment rendering ensure smooth interactions with documents exceeding 50k words.

## Future Roadmap
- **Persistant Backend**: Migration to MongoDB + Node.js (Express).
- **Socket.io Integration**: True sub-millisecond real-time synchronization.
- **Rich Text Support**: Moving beyond plain text extraction to HTML-based rendering.
