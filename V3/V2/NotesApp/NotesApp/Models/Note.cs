namespace NotesApp.Models
{
    public class Note
    {
        public int Id { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.Now;

        // Новые поля
        public bool IsPinned { get; set; } = false;
        public string? Category { get; set; }
        public bool IsDeleted { get; set; } = false;

        public List<NoteAttachment> Attachments { get; set; } = new();
    }

    public class NoteAttachment
    {
        public int Id { get; set; }
        public int NoteId { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public DateTime UploadedAt { get; set; } = DateTime.Now;
    }
}