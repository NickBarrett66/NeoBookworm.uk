(function() {
  function loadHeader(){
    fetch('header.html')
      .then(function(resp){ if(!resp.ok) throw new Error('Network response not ok'); return resp.text(); })
      .then(function(html){
        var container = document.getElementById('site-header');
        if(container) container.innerHTML = html;
      })
      .catch(function(err){ console.error('Failed to load header:', err); });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', loadHeader);
  } else {
    loadHeader();
  }
})();