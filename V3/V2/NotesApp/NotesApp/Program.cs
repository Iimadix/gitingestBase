using Microsoft.EntityFrameworkCore;
using NotesApp.Data;
using NotesApp.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllersWithViews()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });

builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite("Data Source=notes.db"));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");


// Получить активные заметки (сначала закрепленные, потом остальные)
app.MapGet("/api/notes", async (AppDbContext db) =>
    Results.Ok(await db.Notes
        .Include(n => n.Attachments)
        .Where(n => !n.IsDeleted)
        .OrderByDescending(n => n.IsPinned)
        .ThenByDescending(n => n.CreatedAt)
        .ToListAsync()));

// Получить заметки из корзины
app.MapGet("/api/notes/trash", async (AppDbContext db) =>
    Results.Ok(await db.Notes
        .Include(n => n.Attachments)
        .Where(n => n.IsDeleted)
        .OrderByDescending(n => n.CreatedAt)
        .ToListAsync()));

// Создать заметку
app.MapPost("/api/notes", async (HttpRequest request, AppDbContext db, IWebHostEnvironment env) =>
{
    if (!request.HasFormContentType)
        return Results.BadRequest("Ожидается multipart/form-data запрос.");

    var form = await request.ReadFormAsync();
    string title = form["title"];
    string content = form["content"];
    string category = form["category"];
    bool isPinned = form["isPinned"] == "true";

    if (string.IsNullOrWhiteSpace(title))
        return Results.BadRequest("Заголовок не может быть пустым!");

    var note = new Note
    {
        Title = title,
        Content = content ?? string.Empty,
        Category = string.IsNullOrWhiteSpace(category) ? null : category.Trim(),
        IsPinned = isPinned,
        CreatedAt = DateTime.Now
    };

    if (form.Files.Count > 0)
    {
        string uploadsFolder = Path.Combine(env.WebRootPath, "uploads");
        if (!Directory.Exists(uploadsFolder)) Directory.CreateDirectory(uploadsFolder);

        foreach (var file in form.Files)
        {
            if (file.Length > 0)
            {
                string uniqueName = Guid.NewGuid().ToString() + "_" + file.FileName;
                string filePath = Path.Combine(uploadsFolder, uniqueName);

                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                note.Attachments.Add(new NoteAttachment
                {
                    FileName = file.FileName,
                    FilePath = $"/uploads/{uniqueName}"
                });
            }
        }
    }

    db.Notes.Add(note);
    await db.SaveChangesAsync();

    return Results.Json(note);
});

// Обновить заметку
app.MapPut("/api/notes/{id:int}", async (int id, HttpRequest request, AppDbContext db, IWebHostEnvironment env) =>
{
    var note = await db.Notes.Include(n => n.Attachments).FirstOrDefaultAsync(n => n.Id == id);
    if (note is null) return Results.NotFound();

    if (!request.HasFormContentType)
        return Results.BadRequest("Ожидается multipart/form-data запрос.");

    var form = await request.ReadFormAsync();
    string title = form["title"];
    string content = form["content"];
    string category = form["category"];
    bool isPinned = form["isPinned"] == "true";

    if (string.IsNullOrWhiteSpace(title))
        return Results.BadRequest("Заголовок не может быть пустым!");

    note.Title = title;
    note.Content = content ?? string.Empty;
    note.Category = string.IsNullOrWhiteSpace(category) ? null : category.Trim();
    note.IsPinned = isPinned;

    var keepIds = form["keepAttachmentIds"]
        .Where(x => !string.IsNullOrEmpty(x))
        .Select(x => int.Parse(x!))
        .ToList();

    var attachmentsToRemove = note.Attachments.Where(a => !keepIds.Contains(a.Id)).ToList();
    foreach (var att in attachmentsToRemove)
    {
        string fullPath = Path.Combine(env.WebRootPath, att.FilePath.TrimStart('/'));
        if (File.Exists(fullPath)) File.Delete(fullPath);
        db.NoteAttachments.Remove(att);
    }

    if (form.Files.Count > 0)
    {
        string uploadsFolder = Path.Combine(env.WebRootPath, "uploads");
        if (!Directory.Exists(uploadsFolder)) Directory.CreateDirectory(uploadsFolder);

        foreach (var file in form.Files)
        {
            if (file.Length > 0)
            {
                string uniqueName = Guid.NewGuid().ToString() + "_" + file.FileName;
                string filePath = Path.Combine(uploadsFolder, uniqueName);

                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                note.Attachments.Add(new NoteAttachment
                {
                    FileName = file.FileName,
                    FilePath = $"/uploads/{uniqueName}"
                });
            }
        }
    }

    await db.SaveChangesAsync();
    return Results.Ok(note);
});

// Закрепить / открепить заметку
app.MapPatch("/api/notes/{id:int}/pin", async (int id, AppDbContext db) =>
{
    var note = await db.Notes.FindAsync(id);
    if (note is null) return Results.NotFound();

    note.IsPinned = !note.IsPinned;
    await db.SaveChangesAsync();
    return Results.Ok(note);
});

// Мягкое удаление (перенос в корзину)
app.MapDelete("/api/notes/{id:int}", async (int id, AppDbContext db) =>
{
    var note = await db.Notes.FindAsync(id);
    if (note is null) return Results.NotFound();

    note.IsDeleted = true;
    note.IsPinned = false;
    await db.SaveChangesAsync();
    return Results.Ok();
});

// Восстановить из корзины
app.MapPatch("/api/notes/{id:int}/restore", async (int id, AppDbContext db) =>
{
    var note = await db.Notes.FindAsync(id);
    if (note is null) return Results.NotFound();

    note.IsDeleted = false;
    await db.SaveChangesAsync();
    return Results.Ok(note);
});

// Полное удаление навсегда (из корзины)
app.MapDelete("/api/notes/{id:int}/permanent", async (int id, AppDbContext db, IWebHostEnvironment env) =>
{
    var noteToDelete = await db.Notes.Include(n => n.Attachments).FirstOrDefaultAsync(n => n.Id == id);
    if (noteToDelete is null) return Results.NotFound();

    foreach (var att in noteToDelete.Attachments)
    {
        string fullPath = Path.Combine(env.WebRootPath, att.FilePath.TrimStart('/'));
        if (File.Exists(fullPath)) File.Delete(fullPath);
    }

    db.Notes.Remove(noteToDelete);
    await db.SaveChangesAsync();
    return Results.Ok();
});

// Эндпоинт для загрузки картинок прямо в тело редактора Quill
app.MapPost("/api/upload/image", async (HttpRequest request, IWebHostEnvironment env) =>
{
    if (!request.HasFormContentType || request.Form.Files.Count == 0)
    {
        return Results.BadRequest(new { error = "Файл не найден" });
    }

    var file = request.Form.Files[0];
    if (file.Length == 0) return Results.BadRequest(new { error = "Пустой файл" });

    string uploadsFolder = Path.Combine(env.WebRootPath, "uploads");
    if (!Directory.Exists(uploadsFolder)) Directory.CreateDirectory(uploadsFolder);

    string uniqueName = Guid.NewGuid().ToString() + "_" + file.FileName;
    string filePath = Path.Combine(uploadsFolder, uniqueName);

    using (var stream = new FileStream(filePath, FileMode.Create))
    {
        await file.CopyToAsync(stream);
    }

    return Results.Json(new { url = $"/uploads/{uniqueName}" });
});

// === ЭНДПОИНТЫ ДЛЯ ЗАДАЧ ===

app.MapGet("/api/tasks", async (AppDbContext db) =>
{
    var tasks = await db.TodoTasks.OrderBy(t => t.IsCompleted).ThenBy(t => t.DueDate).ToListAsync();
    return Results.Json(tasks, new System.Text.Json.JsonSerializerOptions { PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase });
});

app.MapPost("/api/tasks", async (TodoTask newTask, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(newTask.Title)) return Results.BadRequest("Заголовок пуст!");
    newTask.CreatedAt = DateTime.Now;
    db.TodoTasks.Add(newTask);
    await db.SaveChangesAsync();
    return Results.Json(newTask);
});

app.MapPut("/api/tasks/{id:int}", async (int id, TodoTask updateTask, AppDbContext db) =>
{
    var task = await db.TodoTasks.FindAsync(id);
    if (task is null) return Results.NotFound();

    task.Title = updateTask.Title;
    task.Description = updateTask.Description;
    task.DueDate = updateTask.DueDate;
    task.Priority = updateTask.Priority;
    task.IsCompleted = updateTask.IsCompleted;

    await db.SaveChangesAsync();
    return Results.Ok(task);
});

app.MapPatch("/api/tasks/{id:int}/toggle", async (int id, AppDbContext db) =>
{
    var task = await db.TodoTasks.FindAsync(id);
    if (task is null) return Results.NotFound();

    task.IsCompleted = !task.IsCompleted;
    await db.SaveChangesAsync();
    return Results.Ok(task);
});

app.MapDelete("/api/tasks/{id:int}", async (int id, AppDbContext db) =>
{
    var taskToDelete = await db.TodoTasks.FindAsync(id);
    if (taskToDelete is null) return Results.NotFound();

    db.TodoTasks.Remove(taskToDelete);
    await db.SaveChangesAsync();
    return Results.Ok();
});

app.Run();