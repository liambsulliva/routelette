<script>
    export let latitude = 0;
    export let longitude = 0;
    export let zoom = 10;
</script>

<div>
    <iframe
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.1},${latitude - 0.1},${longitude + 0.1},${latitude + 0.1}&amp;layer=mapnik&amp;marker=${latitude},${longitude}`}
        width="100%"
        height="300"
        frameborder="0"
        scrolling="no"
        marginheight="0"
        marginwidth="0"
    ></iframe>
</div>