// User function Template for Java

class GFG {
    ArrayList<Integer> find(int arr[], int x) {
        ArrayList<Integer> arrlist = new ArrayList<>();
        int n = arr.length;
        for(int i = 0 ; i < n ; i++){
            if(arr[i] == x){
                arrlist.add(i);
            }
        }
        for(int i = n-1 ; i >= 0 ; i-){
            if(arr[i] == x){
                arrlist.add(i);
            }
        }
        return arrlist;
    }
}