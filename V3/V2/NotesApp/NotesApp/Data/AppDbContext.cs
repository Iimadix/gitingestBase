using Microsoft.EntityFrameworkCore;
using NotesApp.Models;

namespace NotesApp.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<Note> Notes => Set<Note>();
        public DbSet<NoteAttachment> NoteAttachments => Set<NoteAttachment>();
        public DbSet<TodoTask> TodoTasks => Set<TodoTask>();
    }
}