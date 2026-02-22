function toggleMenu(){
  const el = document.getElementById("menuPanel");
  if (!el) return;
  el.style.display = (el.style.display === "block") ? "none" : "block";
}
