// User function Template for Java

class GFG {
    ArrayList<Integer> find(int arr[], int x) {
        // code here
        int f1=-1,f2=-1;
        for(int i=0;i<arr.length;i++){
            if(arr[i]==x){
                f1=i;
                break;
            }
        }
        for(int i=0;i<arr.length;i++){
            if(arr[i]==x){
                f2=i;
            }
        }
        ArrayList<Integer> result = new ArrayList<>();
        result.add(f1);
        result.add(f2);
        return result;
        /*find.add(f1);
        find.add(f2);
        return find;*/
    }
}